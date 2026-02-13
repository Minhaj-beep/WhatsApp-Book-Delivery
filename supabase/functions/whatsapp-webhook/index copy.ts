import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STATES = {
  AWAIT_CODE: "AWAIT_CODE",
  AWAIT_CLASS: "AWAIT_CLASS",
  AWAIT_CATEGORY: "AWAIT_CATEGORY",
  AWAIT_DELIVERY: "AWAIT_DELIVERY",
  AWAIT_ADDRESS: "AWAIT_ADDRESS",
  AWAIT_CONFIRM: "AWAIT_CONFIRM",
  PAYMENT_WAIT: "PAYMENT_WAIT",
};

async function sendWhatsAppMessage(phone: string, message: string) {
  const twilioAccountSid = Deno.env.get("WHATSAPP_PROVIDER_API_KEY");
  const twilioAuthToken = Deno.env.get("WHATSAPP_PROVIDER_API_SECRET");
  const twilioPhoneNumber = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "whatsapp:+14155238886";

  if (!twilioAccountSid || !twilioAuthToken) {
    console.log(`[Mock] Would send to ${phone}: ${message}`);
    return;
  }

  try {
    const toNumber = phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const params = new URLSearchParams();
    params.append("From", twilioPhoneNumber);
    params.append("To", toNumber);
    params.append("Body", message);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Twilio API error:", errorText);
    } else {
      console.log(`Message sent successfully to ${phone}`);
    }
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    console.log("=== WhatsApp Webhook Received ===");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const formData = await req.formData();

    // Keep entire form for raw logging
    const rawPayload: Record<string, any> = {};
    for (const [k, v] of formData.entries()) rawPayload[k] = v;

    const body = formData.get("Body")?.toString() || "";
    const from = formData.get("From")?.toString() || "";
    const messageSid = formData.get("MessageSid")?.toString() || "";

    console.log("Received data:", { body, from, messageSid });

    if (!from || !body) {
      console.log("Missing from or body");
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    const phone = from.replace("whatsapp:", "");
    const text = body.trim();

    // log incoming message to DB (helpful for audits)
    await supabase.from("whatsapp_messages").insert({
      phone,
      direction: "in",
      message_sid: messageSid,
      raw_payload: rawPayload,
    });

    // load conversation (if any)
    let { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();

    // default state/context
    let state = conversation?.state || STATES.AWAIT_CODE;
    let context = conversation?.context || {};

    // helper: merge-and-save context and update local conversation copy
    async function saveState(newState: string, newContext: Record<string, any>) {
      const merged = { ...(conversation?.context || {}), ...(newContext || {}) };
      const upsertBody = {
        phone,
        state: newState,
        context: merged,
        last_message_at: new Date().toISOString(),
      };
      await supabase.from("whatsapp_conversations").upsert(upsertBody);
      // keep local copy for subsequent merges in this request
      conversation = { ...(conversation || {}), ...upsertBody };
      state = newState;
      context = merged;
      return merged;
    }

    // Recognize START to reset conversation at any time
    if (text.toUpperCase() === "START") {
      await supabase.from("whatsapp_conversations").delete().eq("phone", phone);
      await sendWhatsAppMessage(phone, "Welcome — send your 4-digit school code to begin ordering.");
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // -------------- STATE MACHINE --------------

    // AWAIT_CODE
    if (state === STATES.AWAIT_CODE) {
      if (!/^\d{4}$/.test(text)) {
        await sendWhatsAppMessage(phone, "Please send your 4-digit school code to start ordering.");
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
        });
      }

      const { data: school } = await supabase
        .from("schools")
        .select("id, name, code_4digit, active")
        .eq("code_4digit", text)
        .eq("active", true)
        .maybeSingle();

      if (!school) {
        await sendWhatsAppMessage(phone, "❌ Invalid school code. Please check and try again.");
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
        });
      }

      const { data: classes } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", school.id)
        .order("sort_order");

      const newCtx = {
        school_id: school.id,
        school_name: school.name,
        school_code: school.code_4digit,
        classes,
        selected_items: [],
      };
      await saveState(STATES.AWAIT_CLASS, newCtx);

      const classList = (classes || []).map((c: any, i: number) => `${i + 1}. ${c.name}`).join("\n") || "No classes found.";
      await sendWhatsAppMessage(phone, `✅ Code accepted for ${school.name}.\n\nSelect your class:\n${classList}\n\nReply with the number.`);
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // AWAIT_CLASS
    if (state === STATES.AWAIT_CLASS) {
      const idx = parseInt(text, 10) - 1;
      if (!Array.isArray(context.classes) || isNaN(idx) || idx < 0 || idx >= context.classes.length) {
        await sendWhatsAppMessage(phone, "Invalid selection. Please reply with the class number from the list.");
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
        });
      }

      const chosen = context.classes[idx];
      const newCtx = {
        class_id: chosen.id,
        class_name: chosen.name,
      };
      await saveState(STATES.AWAIT_CATEGORY, newCtx);

      await sendWhatsAppMessage(phone, "What would you like to order?\n\n1. Books\n2. Stationery\n\nReply with 1 or 2.");
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // AWAIT_CATEGORY
    if (state === STATES.AWAIT_CATEGORY) {
      if (text !== "1" && text !== "2") {
        await sendWhatsAppMessage(phone, "Please reply with 1 for Books or 2 for Stationery.");
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
        });
      }

      const category = text === "1" ? "books" : "stationery";

      // find groups of that type, then filter by class assignment
      const { data: groups } = await supabase
        .from("groups")
        .select("id, name")
        .eq("type", category);

      const { data: assignments } = await supabase
        .from("class_group_assignments")
        .select("group_id")
        .eq("class_id", context.class_id);

      const assignedIds = (assignments || []).map((a: any) => a.group_id);
      const availableGroups = (groups || []).filter((g: any) => assignedIds.includes(g.id));

      if (!availableGroups.length) {
        await sendWhatsAppMessage(phone, "No items available for your class/category. Please contact support.");
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
        });
      }

      const groupId = availableGroups[0].id;

      const { data: items } = await supabase
        .from("items")
        .select("id, title, price_paise, stock, active")
        .eq("group_id", groupId)
        .eq("active", true);

      const newCtx = {
        category,
        items: items || [],
        selected_items: [],
      };
      await saveState(STATES.AWAIT_DELIVERY, newCtx);

      // preview items (first 5)
      const preview = (items || []).slice(0, 5).map((it: any, i: number) => `${i + 1}. ${it.title} — ₹${(it.price_paise/100).toFixed(2)}`).join("\n");
      await sendWhatsAppMessage(phone, `Available items:\n${preview}\n\nChoose delivery:\n1. School Delivery - ₹50\n2. Home Delivery - ₹150\n\nReply with 1 or 2.`);
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // AWAIT_DELIVERY
    if (state === STATES.AWAIT_DELIVERY) {
      if (text !== "1" && text !== "2") {
        await sendWhatsAppMessage(phone, "Please reply with 1 for School delivery or 2 for Home delivery.");
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
        });
      }

      const delivery_type = text === "1" ? "school" : "home";
      const newCtx = { delivery_type };
      const nextState = delivery_type === "home" ? STATES.AWAIT_ADDRESS : STATES.AWAIT_CONFIRM;

      await saveState(nextState, newCtx);

      if (delivery_type === "home") {
        await sendWhatsAppMessage(phone, "Please send your complete delivery address.");
      } else {
        await sendWhatsAppMessage(phone, "Type CONFIRM to place your order.");
      }

      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // AWAIT_ADDRESS
    if (state === STATES.AWAIT_ADDRESS) {
      // simple address capture
      await saveState(STATES.AWAIT_CONFIRM, { address: text });
      await sendWhatsAppMessage(phone, "Type CONFIRM to place your order.");
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // AWAIT_CONFIRM
    if (state === STATES.AWAIT_CONFIRM) {
      if (text.toUpperCase() !== "CONFIRM") {
        await sendWhatsAppMessage(phone, "Type CONFIRM to place your order, or START to begin a new order.");
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
        });
      }

      // guard
      if (!context.school_code) {
        console.error("Missing school_code in context:", context);
        await sendWhatsAppMessage(phone, "Something went wrong. Please type START and try again.");
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
        });
      }

      // Prepare order items (default: first up to 3 items with qty=1)
      const safeItems = (context.items || []).slice(0, 3).map((it: any) => ({ item_id: it.id, qty: 1 }));

      if (!safeItems.length) {
        await sendWhatsAppMessage(phone, "No items available to order. Please contact support.");
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
        });
      }

      console.log("Creating order with school_code:", context.school_code);

      // call create-order function (should be deployed with --no-verify-jwt)
      const createOrderUrl = `${supabaseUrl}/functions/v1/create-order`;
      const orderRes = await fetch(createOrderUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_code: context.school_code,
          class_id: context.class_id,
          category: context.category,
          items: safeItems,
          delivery_type: context.delivery_type,
          parent_phone: phone,
          parent_name: context.parent_name,
          address: context.address,
        }),
      });

      if (!orderRes.ok) {
        const errorText = await orderRes.text();
        console.error("Create-order failed:", errorText);
        // return friendly message but include the server error to help debugging
        await sendWhatsAppMessage(phone, `Order failed: ${errorText}`);
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
        });
      }

      const orderData = await orderRes.json();

      // success: notify user + remove conversation
      const amount = (orderData.total_amount_paise / 100).toFixed(2);
      const paymentMsg = orderData.payment_link ? `Payment link: ${orderData.payment_link}` : "Payment link will be sent shortly.";

      await sendWhatsAppMessage(phone, `✅ Order #${orderData.order_id} created!\nTotal: ₹${amount}\n${paymentMsg}`);

      await supabase.from("whatsapp_conversations").delete().eq("phone", phone);

      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // Fallback — unknown state
    await sendWhatsAppMessage(phone, "Something unexpected happened. Please type START to begin again.");
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  }
});
