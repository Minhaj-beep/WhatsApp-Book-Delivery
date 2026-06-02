import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ConversationState {
  phone: string;
  state: string;
  context: Record<string, any>;
}

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
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log("=== WhatsApp Webhook Received ===");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const formData = await req.formData();
    const body = formData.get("Body")?.toString() || "";
    const from = formData.get("From")?.toString() || "";
    const messageSid = formData.get("MessageSid")?.toString() || "";

    console.log("Received data:", { body, from, messageSid });

    if (!from || !body) {
      console.log("Missing from or body");
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { status: 200, headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    const phone = from.replace("whatsapp:", "");
    const text = body.trim();

    console.log("Processing message:", { phone, text });

    await supabase.from("whatsapp_messages").insert({
      phone,
      direction: "in",
      raw_payload: { Body: body, From: from, MessageSid: messageSid },
    });

    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();

    let state = conversation?.state || "AWAIT_CODE";
    let context = conversation?.context || {};

    if (state === "AWAIT_CODE") {
      if (/^\d{4}$/.test(text)) {
        const { data: school } = await supabase
          .from("schools")
          .select("id, name, code_4digit")
          .eq("code_4digit", text)
          .eq("active", true)
          .maybeSingle();

        if (school) {
          const { data: classes } = await supabase
            .from("classes")
            .select("id, name")
            .eq("school_id", school.id)
            .order("sort_order");

          context = { school_id: school.id, school_name: school.name, school_code: school.code_4digit };
          state = "AWAIT_CLASS";

          const classList = classes?.map((c, i) => `${i + 1}. ${c.name}`).join("\n") || "";
          await sendWhatsAppMessage(
            phone,
            `✅ Code accepted for ${school.name}.\n\nSelect your class:\n${classList}\n\nReply with the number.`
          );

          await supabase.from("whatsapp_conversations").upsert({
            phone,
            state,
            context: { ...context, classes },
            last_message_at: new Date().toISOString(),
          });
        } else {
          await sendWhatsAppMessage(phone, "❌ Invalid school code. Please check and try again.");
        }
      } else {
        await sendWhatsAppMessage(phone, "Please send your 4-digit school code to start ordering.");
      }
    } else if (state === "AWAIT_CLASS") {
      const classIndex = parseInt(text) - 1;
      const classes = context.classes || [];

      if (classIndex >= 0 && classIndex < classes.length) {
        const selectedClass = classes[classIndex];
        context.class_id = selectedClass.id;
        context.class_name = selectedClass.name;
        state = "AWAIT_CATEGORY";

        await sendWhatsAppMessage(
          phone,
          "What would you like to order?\n\n1. Books\n2. Stationery\n\nReply with 1 or 2."
        );

        await supabase.from("whatsapp_conversations").upsert({
          phone,
          state,
          context,
          last_message_at: new Date().toISOString(),
        });
      } else {
        await sendWhatsAppMessage(phone, "Invalid selection. Please reply with a valid class number.");
      }
    } else if (state === "AWAIT_CATEGORY") {
      if (text === "1" || text === "2") {
        context.category = text === "1" ? "books" : "stationery";

        const { data: groups } = await supabase
          .from("groups")
          .select("id, name")
          .eq("type", context.category);

        if (groups && groups.length > 0) {
          const { data: assignments } = await supabase
            .from("class_group_assignments")
            .select("group_id")
            .eq("class_id", context.class_id);

          const assignedGroupIds = assignments?.map(a => a.group_id) || [];
          const availableGroups = groups.filter(g => assignedGroupIds.includes(g.id));

          if (availableGroups.length > 0) {
            const groupId = availableGroups[0].id;

            const { data: items } = await supabase
              .from("items")
              .select("id, title, price_paise, stock")
              .eq("group_id", groupId)
              .eq("active", true);

            context.items = items;
            context.selected_items = [];
            state = "AWAIT_DELIVERY";

            await sendWhatsAppMessage(
              phone,
              "Choose delivery option:\n\n1. School Delivery - ₹50\n2. Home Delivery - ₹150\n\nReply with 1 or 2."
            );

            await supabase.from("whatsapp_conversations").upsert({
              phone,
              state,
              context,
              last_message_at: new Date().toISOString(),
            });
          } else {
            await sendWhatsAppMessage(phone, "No items available for your class. Please contact support.");
          }
        }
      } else {
        await sendWhatsAppMessage(phone, "Please reply with 1 for Books or 2 for Stationery.");
      }
    } else if (state === "AWAIT_DELIVERY") {
      if (text === "1" || text === "2") {
        context.delivery_type = text === "1" ? "school" : "home";

        if (context.delivery_type === "home") {
          state = "AWAIT_ADDRESS";
          await sendWhatsAppMessage(phone, "Please send your complete home delivery address.");
        } else {
          state = "AWAIT_CONFIRM";
          await sendWhatsAppMessage(phone, "Type CONFIRM to place your order.");
        }

        await supabase.from("whatsapp_conversations").upsert({
          phone,
          state,
          context,
          last_message_at: new Date().toISOString(),
        });
      } else {
        await sendWhatsAppMessage(phone, "Please reply with 1 for School or 2 for Home delivery.");
      }
    } else if (state === "AWAIT_ADDRESS") {
      context.address = text;
      state = "AWAIT_CONFIRM";

      await sendWhatsAppMessage(phone, "Type CONFIRM to place your order.");

      await supabase.from("whatsapp_conversations").upsert({
        phone,
        state,
        context,
        last_message_at: new Date().toISOString(),
      });
    } else if (state === "AWAIT_CONFIRM") {
      if (text.toUpperCase() === "CONFIRM") {
        const itemsToOrder = context.items?.slice(0, 3).map((item: any) => ({
          item_id: item.id,
          qty: 1,
        })) || [];

        const createOrderUrl = `${supabaseUrl}/functions/v1/create-order`;
        const orderRes = await fetch(createOrderUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            school_code: context.school_code || "1000",
            class_id: context.class_id,
            category: context.category,
            items: itemsToOrder,
            delivery_type: context.delivery_type,
            parent_phone: phone,
            address: context.address,
          }),
        });

        if (orderRes.ok) {
          const orderData = await orderRes.json();
          state = "PAYMENT_WAIT";

          const amount = (orderData.total_amount_paise / 100).toFixed(2);
          await sendWhatsAppMessage(
            phone,
            `✅ Order #${orderData.order_id} created!\n\nTotal: ₹${amount}\n\nPayment link: ${orderData.payment_link || "Will be sent shortly"}`
          );

          await supabase.from("whatsapp_conversations").delete().eq("phone", phone);
        } else {
          await sendWhatsAppMessage(phone, "Failed to create order. Please try again or contact support.");
        }
      } else {
        await sendWhatsAppMessage(phone, "Type CONFIRM to place your order, or START to begin a new order.");
      }
    }

    console.log("=== Webhook processed successfully ===");
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      }
    );
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      }
    );
  }
});
