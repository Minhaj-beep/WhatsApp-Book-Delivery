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

/** Simple text sender */
async function sendWhatsAppText(phone: string, message: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!token || !phoneNumberId) {
    console.log(`[Mock] Would send to ${phone}: ${message}`);
    return;
  }

  try {
    const cleanPhone = phone.replace(/^whatsapp:/i, "").replace(/^\+/, "");
    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "text",
      text: { body: message },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = text; }

    if (!res.ok) {
      console.error("WhatsApp Cloud API error. status:", res.status, "body:", parsed);
    } else {
      console.log(`Message sent to ${phone}. status: ${res.status} body:`, parsed);
    }
  } catch (err) {
    console.error("Error sending WhatsApp text:", err);
  }
}

/**
 * Button interactive sender (max 3 buttons).
 * Automatically trims titles to 1..20 characters required by WhatsApp API.
 */
async function sendWhatsAppButtons(phone: string, bodyText: string, buttons: { id: string; title: string }[]) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  // sanitize titles to conform to WhatsApp limits
  const sanitizedButtons = buttons.map((b) => {
    let title = (b.title || "").toString();
    if (title.length === 0) title = "Option";
    if (title.length > 20) {
      console.warn(`Trimming button title "${b.title}" to 20 chars`);
      title = title.slice(0, 20);
    }
    return { id: b.id, title };
  });

  if (!token || !phoneNumberId) {
    console.log(`[Mock-Buttons] ${phone}: ${bodyText} Buttons: ${JSON.stringify(sanitizedButtons)}`);
    return;
  }

  try {
    const cleanPhone = phone.replace(/^whatsapp:/i, "").replace(/^\+/, "");
    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: sanitizedButtons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = text; }

    if (!res.ok) {
      console.error("WhatsApp Buttons API error. status:", res.status, "body:", parsed);
    } else {
      console.log(`Button message sent to ${phone}. status: ${res.status} body:`, parsed);
    }
  } catch (err) {
    console.error("Error sending WhatsApp buttons:", err);
  }
}

/** List interactive sender */
async function sendWhatsAppList(phone: string, bodyText: string, buttonText: string, sectionTitle: string, rows: { id: string; title: string; description?: string }[]) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!token || !phoneNumberId) {
    console.log(`[Mock-List] ${phone}: ${bodyText} Rows: ${JSON.stringify(rows)}`);
    return;
  }

  try {
    const cleanPhone = phone.replace(/^whatsapp:/i, "").replace(/^\+/, "");
    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: buttonText,
          sections: [
            {
              title: sectionTitle,
              rows: rows.map((r) => ({ id: r.id, title: r.title, description: r.description || "" })),
            },
          ],
        },
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = text; }

    if (!res.ok) {
      console.error("WhatsApp List API error. status:", res.status, "body:", parsed);
    } else {
      console.log(`List message sent to ${phone}. status: ${res.status} body:`, parsed);
    }
  } catch (err) {
    console.error("Error sending WhatsApp list:", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  // webhook verify
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

    const contentType = req.headers.get("content-type") || "";
    let rawPayload: Record<string, any> = {};

    let bodyText = "";
    let from = "";
    let messageSid = "";

    if (contentType.includes("application/json") || contentType.includes("application/ld+json")) {
      const payload = await req.json();
      rawPayload = payload;

      const messageObj =
        payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
        payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];

      if (messageObj) {
        // Prefer interactive replies (id), then title, then text body
        bodyText =
          messageObj?.interactive?.button_reply?.id ||
          messageObj?.interactive?.list_reply?.id ||
          messageObj?.interactive?.button_reply?.title ||
          messageObj?.interactive?.list_reply?.title ||
          messageObj?.text?.body ||
          messageObj?.button?.text ||
          messageObj?.body ||
          "";

        from = messageObj?.from || "";
        messageSid = messageObj?.id || "";
      } else {
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
      // fallback (Twilio style)
      const formData = await req.formData();
      for (const [k, v] of formData.entries()) rawPayload[k] = v;
      bodyText = formData.get("Body")?.toString() || "";
      from = formData.get("From")?.toString() || "";
      messageSid = formData.get("MessageSid")?.toString() || "";
    }

    const body = bodyText.trim();
    if (!from || !body) {
      console.log("Missing 'from' or 'body' in incoming webhook. Raw payload:", rawPayload);
      await supabase.from("whatsapp_messages").insert({
        phone: from || null,
        direction: "in",
        message_sid: messageSid || null,
        raw_payload: rawPayload,
      });
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const phone = from.replace(/^whatsapp:/i, "").replace(/^\+/, "");
    const normalizedPhone = phone;

    console.log("Received data:", { body, from, messageSid });

    // log incoming message
    await supabase.from("whatsapp_messages").insert({
      phone: normalizedPhone,
      direction: "in",
      message_sid: messageSid || null,
      raw_payload: rawPayload,
    });

    // load conversation
    let { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    let state = conversation?.state || STATES.AWAIT_CODE;
    let context = conversation?.context || {};

    async function saveState(newState: string, newContext: Record<string, any>) {
      const merged = { ...(conversation?.context || {}), ...(newContext || {}) };
      const upsertBody = {
        phone: normalizedPhone,
        state: newState,
        context: merged,
        last_message_at: new Date().toISOString(),
      };
      await supabase.from("whatsapp_conversations").upsert(upsertBody);
      conversation = { ...(conversation || {}), ...upsertBody };
      state = newState;
      context = merged;
      return merged;
    }

    // restart anywhere
    if (body.toUpperCase() === "START" || body === "restart") {
      await supabase.from("whatsapp_conversations").delete().eq("phone", normalizedPhone);
      await sendWhatsAppText(normalizedPhone, "Welcome — send your 4-digit school code to begin ordering.");
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ---------- STATE MACHINE ----------

    // AWAIT_CODE
    if (state === STATES.AWAIT_CODE) {
      if (!/^\d{4}$/.test(body)) {
        await sendWhatsAppText(normalizedPhone, "Please send your 4-digit school code to start ordering.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // fetch school (defensive)
      let school;
      try {
        const { data } = await supabase
          .from("schools")
          .select("id, name, code_4digit, active")
          .eq("code_4digit", body)
          .eq("active", true)
          .maybeSingle();
        school = data;
      } catch (err) {
        console.error("DB error fetching school:", err);
        await sendWhatsAppText(normalizedPhone, "Server error looking up school. Please try again later.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      if (!school) {
        await sendWhatsAppText(normalizedPhone, "❌ Invalid school code. Please check and try again.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // fetch classes
      let classes;
      try {
        const { data } = await supabase
          .from("classes")
          .select("id, name")
          .eq("school_id", school.id)
          .order("sort_order");
        classes = data || [];
      } catch (err) {
        console.error("DB error fetching classes:", err);
        await sendWhatsAppText(normalizedPhone, "Server error fetching classes. Please try later.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const newCtx = {
        school_id: school.id,
        school_name: school.name,
        school_code: school.code_4digit,
        classes,
        selected_items: [],
      };
      await saveState(STATES.AWAIT_CLASS, newCtx);

      // build list rows (and restart)
      const classRows = (classes || []).map((c: any) => ({ id: `class_${c.id}`, title: c.name }));
      classRows.push({ id: "restart", title: "Restart" });

      await sendWhatsAppList(
        normalizedPhone,
        `✅ Code accepted for ${school.name}.\nSelect your class:`,
        "View classes",
        "Classes",
        classRows
      );

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // AWAIT_CLASS
    if (state === STATES.AWAIT_CLASS) {
      let chosenClass = null;

      if (body.startsWith("class_")) {
        const classId = body.split("_")[1];
        chosenClass = (context.classes || []).find((c: any) => String(c.id) === String(classId));
      } else {
        const idx = parseInt(body, 10) - 1;
        if (Array.isArray(context.classes) && !isNaN(idx) && idx >= 0 && idx < context.classes.length) {
          chosenClass = context.classes[idx];
        }
      }

      if (!chosenClass) {
        if (body === "restart") {
          await supabase.from("whatsapp_conversations").delete().eq("phone", normalizedPhone);
          await sendWhatsAppText(normalizedPhone, "Restarted. Send your 4-digit school code to begin ordering.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }
        await sendWhatsAppText(normalizedPhone, "Invalid selection. Please select your class from the list (or type START).");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      await saveState(STATES.AWAIT_CATEGORY, { class_id: chosenClass.id, class_name: chosenClass.name });

      await sendWhatsAppButtons(normalizedPhone, "What would you like to order?", [
        { id: "cat_books", title: "Books" },
        { id: "cat_stationery", title: "Stationery" },
        { id: "restart", title: "Restart" },
      ]);

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // AWAIT_CATEGORY
    if (state === STATES.AWAIT_CATEGORY) {
      if (body === "restart") {
        await supabase.from("whatsapp_conversations").delete().eq("phone", normalizedPhone);
        await sendWhatsAppText(normalizedPhone, "Restarted. Send your 4-digit school code to begin ordering.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      let category = "";
      if (body === "cat_books" || body.toLowerCase() === "books" || body === "1") category = "books";
      else if (body === "cat_stationery" || body.toLowerCase() === "stationery" || body === "2") category = "stationery";
      else {
        await sendWhatsAppText(normalizedPhone, "Please choose Books or Stationery (use the buttons).");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // fetch groups assigned to class and items — defensive try/catch
      let groups;
      try {
        const { data } = await supabase.from("groups").select("id, name").eq("type", category);
        groups = data || [];
      } catch (err) {
        console.error("DB error fetching groups:", err);
        await sendWhatsAppText(normalizedPhone, "Server error. Please try again later.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      let assignments;
      try {
        const { data } = await supabase
          .from("class_group_assignments")
          .select("group_id")
          .eq("class_id", context.class_id);
        assignments = data || [];
      } catch (err) {
        console.error("DB error fetching assignments:", err);
        await sendWhatsAppText(normalizedPhone, "Server error. Please try again later.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const assignedIds = (assignments || []).map((a: any) => a.group_id);
      const availableGroups = (groups || []).filter((g: any) => assignedIds.includes(g.id));
      if (!availableGroups.length) {
        await sendWhatsAppText(normalizedPhone, "No items available for your class/category. Please contact support.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const groupId = availableGroups[0].id;

      let items;
      try {
        const { data } = await supabase
          .from("items")
          .select("id, title, price_paise, stock, active")
          .eq("group_id", groupId)
          .eq("active", true);
        items = data || [];
      } catch (err) {
        console.error("DB error fetching items:", err);
        await sendWhatsAppText(normalizedPhone, "Server error fetching items. Please try again later.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      await saveState(STATES.AWAIT_DELIVERY, { category, items, selected_items: [] });

      // prepare preview text (with prices and showing delivery charges)
      const preview = (items || []).slice(0, 10).map((it: any, i: number) =>
        `${i + 1}. ${it.title} — ₹${(it.price_paise / 100).toFixed(2)}`
      ).join("\n") || "No items found.";

      // send available items preview (plain text)
      await sendWhatsAppText(normalizedPhone, `Available items:\n${preview}`);

      // send delivery cost info as plain text as well (so customers always see price)
      await sendWhatsAppText(normalizedPhone, `Choose delivery:\n\nSchool Delivery - ₹50\nHome Delivery - ₹150\n\nBelow are quick buttons to choose:`);

      // then send short buttons (titles <= 20 chars)
      await sendWhatsAppButtons(normalizedPhone, "Select delivery option:", [
        { id: "delivery_school", title: "School Delivery" },
        { id: "delivery_home", title: "Home Delivery" },
        { id: "restart", title: "Restart" },
      ]);

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // AWAIT_DELIVERY
    if (state === STATES.AWAIT_DELIVERY) {
      if (body === "restart") {
        await supabase.from("whatsapp_conversations").delete().eq("phone", normalizedPhone);
        await sendWhatsAppText(normalizedPhone, "Restarted. Send your 4-digit school code to begin ordering.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      if (body !== "delivery_school" && body !== "delivery_home" && body !== "1" && body !== "2") {
        await sendWhatsAppText(normalizedPhone, "Please use the delivery buttons (School Delivery or Home Delivery) or type START to restart.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const delivery_type = (body === "delivery_school" || body === "1") ? "school" : "home";
      await saveState(delivery_type === "home" ? STATES.AWAIT_ADDRESS : STATES.AWAIT_CONFIRM, { delivery_type });

      if (delivery_type === "home") {
        // ask user to type only the address
        await sendWhatsAppText(normalizedPhone, "Please send your complete delivery address (type the full address only).");
        // also give restart button if they changed their mind
        await sendWhatsAppButtons(normalizedPhone, "If you'd like to restart instead, press below:", [
          { id: "restart", title: "Restart" },
        ]);
      } else {
        // school delivery — confirm button
        await sendWhatsAppButtons(normalizedPhone, "You're choosing School Delivery. Tap Confirm to place your order.", [
          { id: "confirm", title: "Confirm" },
          { id: "restart", title: "Restart" },
        ]);
      }

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // AWAIT_ADDRESS
    if (state === STATES.AWAIT_ADDRESS) {
      if (body === "restart") {
        await supabase.from("whatsapp_conversations").delete().eq("phone", normalizedPhone);
        await sendWhatsAppText(normalizedPhone, "Restarted. Send your 4-digit school code to begin ordering.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // address must be free text
      const address = body;
      await saveState(STATES.AWAIT_CONFIRM, { address });
      await sendWhatsAppButtons(normalizedPhone, `Address received:\n${address}\n\nTap Confirm to place your order.`, [
        { id: "confirm", title: "Confirm" },
        { id: "restart", title: "Restart" },
      ]);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // AWAIT_CONFIRM
    if (state === STATES.AWAIT_CONFIRM) {
      if (body === "restart") {
        await supabase.from("whatsapp_conversations").delete().eq("phone", normalizedPhone);
        await sendWhatsAppText(normalizedPhone, "Restarted. Send your 4-digit school code to begin ordering.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      if (!(body === "confirm" || body.toUpperCase() === "CONFIRM")) {
        await sendWhatsAppText(normalizedPhone, "Tap Confirm to place your order, or press Restart to start over.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      if (!context.school_code) {
        console.error("Missing school_code in context:", context);
        await sendWhatsAppText(normalizedPhone, "Something went wrong. Please type START and try again.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const safeItems = (context.items || []).slice(0, 3).map((it: any) => ({ item_id: it.id, qty: 1 }));
      if (!safeItems.length) {
        await sendWhatsAppText(normalizedPhone, "No items available to order. Please contact support.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      console.log("Creating order with school_code:", context.school_code);

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
        await sendWhatsAppText(normalizedPhone, `Order failed: ${errorText}`);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const orderData = await orderRes.json();
      const amount = (orderData.total_amount_paise / 100).toFixed(2);
      const paymentMsg = orderData.payment_link ? `Payment link: ${orderData.payment_link}` : "Payment link will be sent shortly.";

      await sendWhatsAppText(normalizedPhone, `✅ Order #${orderData.order_id} created!\nTotal: ₹${amount}\n${paymentMsg}`);

      await supabase.from("whatsapp_conversations").delete().eq("phone", normalizedPhone);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // fallback
    await sendWhatsAppText(normalizedPhone, "Something unexpected happened. Please type START to begin again.");
    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});