import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateShipmentRequest {
  order_id: number;
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
    const delhiveryApiKey = Deno.env.get("DELHIVERY_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { order_id }: CreateShipmentRequest = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        school:schools(*),
        class:classes(*)
      `)
      .eq("id", order_id)
      .single();

    if (orderError) throw orderError;

    if (!order.billed_weight_grams) {
      const computeWeightsUrl = `${supabaseUrl}/functions/v1/compute-weights`;
      const computeRes = await fetch(computeWeightsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ order_id }),
      });

      if (!computeRes.ok) {
        throw new Error("Failed to compute weights");
      }

      const weightData = await computeRes.json();
      order.billed_weight_grams = weightData.billed_weight_grams;
      order.package_weight_grams = weightData.actual_weight_grams;
    }

    const { data: parcels, error: parcelsError } = await supabase
      .from("courier_parcels")
      .select("*")
      .eq("order_id", order_id)
      .order("parcel_index");

    if (parcelsError) throw parcelsError;

    if (!parcels || parcels.length === 0) {
      return new Response(
        JSON.stringify({ error: "No parcels found for order" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!delhiveryApiKey) {
      const mockAwb = `MOCK${Date.now()}`;

      await supabase
        .from("orders")
        .update({
          courier_awb: mockAwb,
          courier_service: "delhivery",
          status: "processing",
        })
        .eq("id", order_id);

      await supabase
        .from("courier_parcels")
        .update({ awb: mockAwb })
        .eq("order_id", order_id);

      return new Response(
        JSON.stringify({
          success: true,
          order_id,
          awb: mockAwb,
          message: "Mock shipment created (Delhivery API key not configured)",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const deliveryAddress = order.delivery_type === "home"
      ? order.delivery_address
      : order.school?.address;

    const shipmentPayload = {
      shipments: [
        {
          name: order.parent_name || "Customer",
          add: deliveryAddress || "Address not provided",
          pin: "400001",
          city: "Mumbai",
          state: "Maharashtra",
          country: "India",
          phone: order.parent_phone,
          order: order_id.toString(),
          payment_mode: "Prepaid",
          return_pin: "400001",
          return_city: "Mumbai",
          return_phone: "9999999999",
          return_add: "Return Address",
          products_desc: "Books and Stationery",
          hsn_code: "",
          cod_amount: "0",
          order_date: null,
          total_amount: (order.total_amount_paise / 100).toString(),
          seller_add: "Seller Address",
          seller_name: "School Supplies Co",
          seller_inv: "",
          quantity: order.package_count.toString(),
          waybill: "",
          shipment_width: parcels[0].width_cm?.toString() || "10",
          shipment_height: parcels[0].height_cm?.toString() || "10",
          weight: (order.billed_weight_grams / 1000).toString(),
          seller_gst_tin: "",
          shipping_mode: "Surface",
          address_type: order.delivery_type === "home" ? "home" : "office",
        },
      ],
      pickup_location: {
        name: "Main Warehouse",
      },
    };

    const delhiveryRes = await fetch("https://track.delhivery.com/api/cmu/create.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${delhiveryApiKey}`,
      },
      body: JSON.stringify(shipmentPayload),
    });

    if (!delhiveryRes.ok) {
      const errorText = await delhiveryRes.text();
      throw new Error(`Delhivery API error: ${errorText}`);
    }

    const delhiveryData = await delhiveryRes.json();
    const awb = delhiveryData.packages?.[0]?.waybill || delhiveryData.waybill;

    if (!awb) {
      throw new Error("No AWB returned from Delhivery");
    }

    await supabase
      .from("orders")
      .update({
        courier_awb: awb,
        courier_service: "delhivery",
        status: "processing",
      })
      .eq("id", order_id);

    await supabase
      .from("courier_parcels")
      .update({ awb })
      .eq("order_id", order_id);

    await supabase
      .from("courier_events")
      .insert({
        order_id,
        courier_name: "delhivery",
        event_type: "shipment_created",
        event_payload: delhiveryData,
      });

    return new Response(
      JSON.stringify({
        success: true,
        order_id,
        awb,
        tracking_url: `https://www.delhivery.com/track/package/${awb}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating shipment:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
