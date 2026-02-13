import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyRazorpaySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const computed = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    return computed === (signature || "").trim().toLowerCase();
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

async function sendWhatsAppMessage(phone: string | null, message: string) {
  if (!phone) { console.log("No phone to send WhatsApp to"); return; }
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) { console.log("WhatsApp credentials missing — skipping send"); return; }

  const clean = String(phone).replace(/^\+/, "");
  try {
    const res = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: clean,
        type: "text",
        text: { body: message },
      }),
    });
    const txt = await res.text();
    if (!res.ok) console.error("WhatsApp Cloud API error. status:", res.status, "body:", txt);
    else console.log("WhatsApp sent:", txt);
  } catch (err) {
    console.error("Error sending WhatsApp message:", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || req.headers.get("X-Razorpay-Signature") || "";
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (webhookSecret) {
    const ok = await verifyRazorpaySignature(rawBody, signature, webhookSecret);
    if (!ok) {
      console.error("Invalid Razorpay webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } else {
    console.warn("RAZORPAY_WEBHOOK_SECRET not set — skipping signature check");
  }

  let eventJson: any;
  try { eventJson = JSON.parse(rawBody); } catch (err) {
    console.error("Invalid JSON payload", err);
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const eventType = eventJson?.event;
  console.log("Razorpay event:", eventType);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // helper: log webhook into courier_events for audit
  async function logWebhook(orderId: number | null, payload: any) {
    try {
      await supabase.from("courier_events").insert({
        order_id: orderId,
        courier_name: "razorpay",
        event_type: payload.event || null,
        event_payload: payload,
      });
    } catch (e) {
      console.error("Failed to log webhook event:", e);
    }
  }

  try {
    // ---------- payment_link.paid (Payment Links success) ----------
    if (eventType === "payment_link.paid") {
      const linkEntity = eventJson.payload?.payment_link?.entity;
      if (!linkEntity) { console.error("No payment_link entity"); return new Response("OK"); }

      const linkId: string | null = linkEntity.id || null; // link_xxx
      const paymentsArr = Array.isArray(linkEntity.payments) ? linkEntity.payments : [];
      const capturedPaymentId = paymentsArr[0]?.id || null;

      // find order using payment_id (we stored the link id in create-order as payment_id)
      const { data: orderRow, error: orderErr } = await supabase.from("orders").select("id, parent_phone, total_amount_paise, payment_status").eq("payment_id", linkId).maybeSingle();
      if (orderErr) throw orderErr;

      if (!orderRow) {
        console.warn("No order found for payment_link id:", linkId);
        // log for future diagnosis
        await logWebhook(null, eventJson);
        return new Response(JSON.stringify({ ok: true, message: "No matching order" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // idempotency
      if (orderRow.payment_status === "paid" || orderRow.status === "confirmed") {
        console.log("Order already paid:", orderRow.id);
        await logWebhook(orderRow.id, eventJson);
        return new Response(JSON.stringify({ ok: true, message: "Already paid" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // update order -> do not overwrite payment_id (already holds link_xxx). Save capture id to courier_events as part of payload.
      const updates: any = {
        payment_status: "paid",
        status: "confirmed",
        paid_at: new Date().toISOString(),
      };

      const { error: updErr } = await supabase.from("orders").update(updates).eq("id", orderRow.id);
      if (updErr) console.error("Failed updating order paid status:", updErr);

      // log webhook event & payment id
      await logWebhook(orderRow.id, eventJson);

      // send whatsapp
      const amountRupees = ((orderRow.total_amount_paise || 0) / 100).toFixed(2);
      await sendWhatsAppMessage(orderRow.parent_phone, `✅ Payment received for Order #${orderRow.id}\nAmount: ₹${amountRupees}\nThank you!`);

      // compute weights (best-effort)
      try {
        await fetch(`${supabaseUrl}/functions/v1/compute-weights`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ order_id: orderRow.id }),
        });
      } catch (e) {
        console.error("compute-weights error:", e);
      }

      // create shipment (best-effort, only if create-shipment exists)
      try {
        const shipmentRes = await fetch(`${supabaseUrl}/functions/v1/create-shipment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ order_id: orderRow.id }),
        });
        const shipmentJson = await shipmentRes.json();
        console.log("create-shipment result:", shipmentJson);

        if (shipmentJson.awb) {
          await sendWhatsAppMessage(orderRow.parent_phone, `📦 Shipment created for Order #${orderRow.id}\nTracking Number: ${shipmentJson.awb}`);
        }
      } catch (e) {
        console.error("create-shipment error:", e);
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------- payment.captured / payment.failed (fallback if you use Orders API) ----------
    if (eventType === "payment.captured" || eventType === "payment.failed") {
      const paymentEntity = eventJson.payload?.payment?.entity;
      if (!paymentEntity) {
        console.warn("payment.* event without payment entity");
        await logWebhook(null, eventJson);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 1) try notes.order_id (recommended approach if you create Razorpay Orders/Payments)
      const notesOrderId = paymentEntity?.notes?.order_id ? Number(paymentEntity.notes.order_id) : null;
      // 2) fallback: if you saved payment_capture id somewhere, you could query that (not implemented here)
      let orderRow: any = null;

      if (notesOrderId) {
        const { data, error } = await supabase.from("orders").select("id, parent_phone, total_amount_paise, payment_status").eq("id", notesOrderId).maybeSingle();
        if (error) throw error;
        orderRow = data;
      }

      // if not found via notes, try to find by payment_id (if you stored payment order id or link)
      if (!orderRow) {
        // attempt to find by matching payment_id to paymentEntity.order_id or other mapping if used
        if (paymentEntity?.order_id) {
          const { data, error } = await supabase.from("orders").select("id, parent_phone, total_amount_paise, payment_status").eq("payment_id", paymentEntity.order_id).maybeSingle();
          if (!error) orderRow = data;
        }
      }

      // if still not found, log and return OK
      if (!orderRow) {
        console.warn("No matching order for payment.captured/failure:", paymentEntity.id || paymentEntity.order_id);
        await logWebhook(null, eventJson);
        return new Response(JSON.stringify({ ok: true, message: "No order match" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Idempotency
      if (eventType === "payment.captured" && (orderRow.payment_status === "paid" || orderRow.status === "confirmed")) {
        console.log("Order already marked paid:", orderRow.id);
        await logWebhook(orderRow.id, eventJson);
        return new Response(JSON.stringify({ ok: true, message: "Already paid" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Update based on event
      const updateObj: any = {};
      if (eventType === "payment.captured") {
        updateObj.payment_status = "paid";
        updateObj.status = "confirmed";
        updateObj.paid_at = new Date().toISOString();
      } else {
        updateObj.payment_status = "failed";
        updateObj.status = "payment_failed";
      }

      const { error: updErr2 } = await supabase.from("orders").update(updateObj).eq("id", orderRow.id);
      if (updErr2) console.error("Failed updating order:", updErr2);

      // Log the whole webhook
      await logWebhook(orderRow.id, eventJson);

      // Notify on success
      if (eventType === "payment.captured") {
        const amountRupees = ((orderRow.total_amount_paise || 0) / 100).toFixed(2);
        await sendWhatsAppMessage(orderRow.parent_phone, `✅ Payment received for Order #${orderRow.id}\nAmount: ₹${amountRupees}\nThank you!`);
      } else {
        await sendWhatsAppMessage(orderRow.parent_phone, `⚠️ Payment failed for Order #${orderRow.id}. Please try again or contact support.`);
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // default: log and return 200
    console.log("Unhandled event type (ignored):", eventType);
    await logWebhook(null, eventJson);
    return new Response(JSON.stringify({ ok: true, event: eventType }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Error processing webhook:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
