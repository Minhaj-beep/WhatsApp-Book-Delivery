import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    const awb = payload.awb || payload.waybill;
    const status = payload.status || payload.Status;
    const statusCode = payload.status_code || payload.StatusCode;

    if (!awb) {
      return new Response(
        JSON.stringify({ error: "No AWB in webhook payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id")
      .eq("courier_awb", awb)
      .maybeSingle();

    if (orderError) throw orderError;

    if (!order) {
      console.log(`Order not found for AWB: ${awb}`);
      return new Response(
        JSON.stringify({ success: true, message: "Order not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: eventError } = await supabase
      .from("courier_events")
      .insert({
        order_id: order.id,
        courier_name: "delhivery",
        event_type: status || statusCode,
        event_payload: payload,
      });

    if (eventError) console.error("Error logging courier event:", eventError);

    let newStatus = null;
    const statusLower = (status || statusCode || "").toLowerCase();

    if (statusLower.includes("picked") || statusLower.includes("pickup")) {
      newStatus = "processing";
    } else if (
      statusLower.includes("in transit") ||
      statusLower.includes("in_transit") ||
      statusLower.includes("dispatched") ||
      statusLower.includes("out for delivery")
    ) {
      newStatus = "out_for_delivery";
    } else if (statusLower.includes("delivered")) {
      newStatus = "delivered";
    } else if (
      statusLower.includes("cancelled") ||
      statusLower.includes("rto") ||
      statusLower.includes("return")
    ) {
      newStatus = "cancelled";
    }

    if (newStatus) {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", order.id);

      if (updateError) throw updateError;

      console.log(`Updated order ${order.id} status to ${newStatus}`);
    }

    return new Response(
      JSON.stringify({ success: true, order_id: order.id, status: newStatus }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing Delhivery webhook:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
