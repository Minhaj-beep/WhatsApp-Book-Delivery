import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyRazorpaySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );

    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSignature === signature;
  } catch (error) {
    console.error("Error verifying signature:", error);
    return false;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    if (webhookSecret && signature) {
      const isValid = await verifyRazorpaySignature(payload, signature, webhookSecret);
      if (!isValid) {
        console.error("Invalid Razorpay webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const event = JSON.parse(payload);
    const eventType = event.event;

    if (eventType === "payment.captured" || eventType === "order.paid") {
      const orderId = event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id;
      const paymentId = event.payload?.payment?.entity?.id;

      if (!orderId) {
        return new Response(
          JSON.stringify({ error: "No order ID in webhook" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, parent_phone, total_amount_paise")
        .eq("payment_id", orderId)
        .maybeSingle();

      if (orderError) throw orderError;

      if (order) {
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            payment_status: "paid",
            status: "confirmed",
          })
          .eq("id", order.id);

        if (updateError) throw updateError;

        const { error: eventError } = await supabase
          .from("courier_events")
          .insert({
            order_id: order.id,
            courier_name: "razorpay",
            event_type: eventType,
            event_payload: event,
          });

        if (eventError) console.error("Error logging courier event:", eventError);

        console.log(`Payment confirmed for order ${order.id}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, event: eventType }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing Razorpay webhook:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
