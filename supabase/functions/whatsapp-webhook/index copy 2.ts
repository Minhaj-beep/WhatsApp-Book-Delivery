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

/**
 * Send a WhatsApp text message using the WhatsApp Cloud API (Meta).
 * If environment variables are missing it logs a mock message (same behaviour as before).
 * This version logs status and response body for easier debugging.
 */
async function sendWhatsAppMessage(phone: string, message: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!token || !phoneNumberId) {
    console.log(`[Mock] Would send to ${phone}: ${message}`);
    return;
  }

  try {
    // Meta expects plain E.164 without "whatsapp:" prefix for the "to" field
    const cleanPhone = phone.replace(/^whatsapp:/i, "").replace(/^\+/, "");

    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "text",
      text: {
        body: message,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = text; }

    if (!res.ok) {
      console.error("WhatsApp Cloud API error. status:", res.status, "body:", parsed);
    } else {
      console.log(`Message sent successfully to ${phone}. status: ${res.status} body:`, parsed);
    }
  } catch (err) {
    console.error("Error sending WhatsApp message:", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Webhook verification required by Meta (GET)
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token && challenge && token === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) {
        return new Response(challenge, { status: 200 });
      }
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    } catch (err) {
      console.error("GET verification error:", err);
      return new Response("Error", { status: 500, headers: corsHeaders });
    }
  }

  try {
    console.log("=== WhatsApp Webhook Received ===");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine content type and parse accordingly:
    const contentType = req.headers.get("content-type") || "";

    // rawPayload will be saved to DB for audit/debugging
    let rawPayload: Record<string, any> = {};

    // Extract 'body' text, 'from' phone, and 'messageSid'/id in a way that supports:
    // - Meta Cloud API JSON payloads
    // - (fallback) Twilio form-encoded payloads (to ease transition)
    let bodyText = "";
    let from = "";
    let messageSid = "";

    if (contentType.includes("application/json") || contentType.includes("application/ld+json")) {
      // Meta Cloud API
      const payload = await req.json();
      rawPayload = payload;

      const messageObj =
        payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
        payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];

      if (messageObj) {
        // message text can be in messageObj.text.body or interactive/list_reply etc.
        bodyText =
          messageObj?.text?.body ||
          messageObj?.interactive?.button_reply?.title ||
          messageObj?.interactive?.list_reply?.title ||
          messageObj?.button?.text ||
          messageObj?.body ||
          "";

        from = messageObj?.from || "";
        messageSid = messageObj?.id || "";
      } else {
        // No message payload; might be a status or other change — log and return OK
        console.log("No message object found in JSON webhook; raw payload saved.");
        await supabase.from("whatsapp_messages").insert({
          phone: null,
          direction: "in",
          message_sid: null,
          raw_payload: rawPayload,
        });
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
    } else {
      // Fallback: parse formData (Twilio-style). This preserves behavior while you switch.
      const formData = await req.formData();
      for (const [k, v] of formData.entries()) rawPayload[k] = v;
      bodyText = formData.get("Body")?.toString() || "";
      from = formData.get("From")?.toString() || "";
      messageSid = formData.get("MessageSid")?.toString() || "";
    }

    const body = bodyText.trim();
    if (!from || !body) {
      console.log("Missing 'from' or 'body' in incoming webhook. Raw payload:", rawPayload);
      // Log the raw payload for debugging, still respond OK
      await supabase.from("whatsapp_messages").insert({
        phone: from || null,
        direction: "in",
        message_sid: messageSid || null,
        raw_payload: rawPayload,
      });
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Normalize phone (Meta gives E.164 without whatsapp: prefix; Twilio may include "whatsapp:")
    const phone = from.replace(/^whatsapp:/i, "").replace(/^\+/, "");
    const normalizedPhone = phone; // keep as string for DB (no leading +)

    console.log("Received data:", { body, from, messageSid });

    // log incoming message to DB (helpful for audits)
    await supabase.from("whatsapp_messages").insert({
      phone: normalizedPhone,
      direction: "in",
      message_sid: messageSid || null,
      raw_payload: rawPayload,
    });

    // load conversation (if any)
    let { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    // default state/context
    let state = conversation?.state || STATES.AWAIT_CODE;
    let context = conversation?.context || {};

    // helper: merge-and-save context and update local conversation copy
    async function saveState(newState: string, newContext: Record<string, any>) {
      const merged = { ...(conversation?.context || {}), ...(newContext || {}) };
      const upsertBody = {
        phone: normalizedPhone,
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
    if (body.toUpperCase() === "START") {
      await supabase.from("whatsapp_conversations").delete().eq("phone", normalizedPhone);
      await sendWhatsAppMessage(normalizedPhone, "Welcome — send your 4-digit school code to begin ordering.");
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // -------------- STATE MACHINE --------------

    // AWAIT_CODE
    if (state === STATES.AWAIT_CODE) {
      if (!/^\d{4}$/.test(body)) {
        await sendWhatsAppMessage(normalizedPhone, "Please send your 4-digit school code to start ordering.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const { data: school } = await supabase
        .from("schools")
        .select("id, name, code_4digit, active")
        .eq("code_4digit", body)
        .eq("active", true)
        .maybeSingle();

      if (!school) {
        await sendWhatsAppMessage(normalizedPhone, "❌ Invalid school code. Please check and try again.");
        return new Response("OK", { status: 200, headers: corsHeaders });
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
      await sendWhatsAppMessage(normalizedPhone, `✅ Code accepted for ${school.name}.\n\nSelect your class:\n${classList}\n\nReply with the number.`);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // AWAIT_CLASS
    if (state === STATES.AWAIT_CLASS) {
      const idx = parseInt(body, 10) - 1;
      if (!Array.isArray(context.classes) || isNaN(idx) || idx < 0 || idx >= context.classes.length) {
        await sendWhatsAppMessage(normalizedPhone, "Invalid selection. Please reply with the class number from the list.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const chosen = context.classes[idx];
      const newCtx = {
        class_id: chosen.id,
        class_name: chosen.name,
      };
      await saveState(STATES.AWAIT_CATEGORY, newCtx);

      await sendWhatsAppMessage(normalizedPhone, "What would you like to order?\n\n1. Books\n2. Stationery\n\nReply with 1 or 2.");
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // AWAIT_CATEGORY
    if (state === STATES.AWAIT_CATEGORY) {
      if (body !== "1" && body !== "2") {
        await sendWhatsAppMessage(normalizedPhone, "Please reply with 1 for Books or 2 for Stationery.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const category = body === "1" ? "books" : "stationery";

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
        await sendWhatsAppMessage(normalizedPhone, "No items available for your class/category. Please contact support.");
        return new Response("OK", { status: 200, headers: corsHeaders });
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
      await sendWhatsAppMessage(normalizedPhone, `Available items:\n${preview}\n\nChoose delivery:\n1. School Delivery - ₹50\n2. Home Delivery - ₹150\n\nReply with 1 or 2.`);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // AWAIT_DELIVERY
    if (state === STATES.AWAIT_DELIVERY) {
      if (body !== "1" && body !== "2") {
        await sendWhatsAppMessage(normalizedPhone, "Please reply with 1 for School delivery or 2 for Home delivery.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const delivery_type = body === "1" ? "school" : "home";
      const newCtx = { delivery_type };
      const nextState = delivery_type === "home" ? STATES.AWAIT_ADDRESS : STATES.AWAIT_CONFIRM;

      await saveState(nextState, newCtx);

      if (delivery_type === "home") {
        await sendWhatsAppMessage(normalizedPhone, "Please send your complete delivery address.");
      } else {
        await sendWhatsAppMessage(normalizedPhone, "Type CONFIRM to place your order.");
      }

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // AWAIT_ADDRESS
    if (state === STATES.AWAIT_ADDRESS) {
      // simple address capture
      await saveState(STATES.AWAIT_CONFIRM, { address: body });
      await sendWhatsAppMessage(normalizedPhone, "Type CONFIRM to place your order.");
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // AWAIT_CONFIRM
    if (state === STATES.AWAIT_CONFIRM) {
      if (body.toUpperCase() !== "CONFIRM") {
        await sendWhatsAppMessage(normalizedPhone, "Type CONFIRM to place your order, or START to begin a new order.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // guard
      if (!context.school_code) {
        console.error("Missing school_code in context:", context);
        await sendWhatsAppMessage(normalizedPhone, "Something went wrong. Please type START and try again.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // Prepare order items (default: first up to 3 items with qty=1)
      const safeItems = (context.items || []).slice(0, 3).map((it: any) => ({ item_id: it.id, qty: 1 }));

      if (!safeItems.length) {
        await sendWhatsAppMessage(normalizedPhone, "No items available to order. Please contact support.");
        return new Response("OK", { status: 200, headers: corsHeaders });
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
          parent_phone: normalizedPhone,
          parent_name: context.parent_name,
          address: context.address,
        }),
      });

      if (!orderRes.ok) {
        const errorText = await orderRes.text();
        console.error("Create-order failed:", errorText);
        // return friendly message but include the server error to help debugging
        await sendWhatsAppMessage(normalizedPhone, `Order failed: ${errorText}`);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const orderData = await orderRes.json();

      // success: notify user + remove conversation
      const amount = (orderData.total_amount_paise / 100).toFixed(2);
      const paymentMsg = orderData.payment_link ? `Payment link: ${orderData.payment_link}` : "Payment link will be sent shortly.";

      await sendWhatsAppMessage(normalizedPhone, `✅ Order #${orderData.order_id} created!\nTotal: ₹${amount}\n${paymentMsg}`);

      await supabase.from("whatsapp_conversations").delete().eq("phone", normalizedPhone);

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Fallback — unknown state
    await sendWhatsAppMessage(normalizedPhone, "Something unexpected happened. Please type START to begin again.");
    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});
