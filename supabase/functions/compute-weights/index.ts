import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ComputeWeightsRequest {
  order_id: number;
}

interface ItemWithDimensions {
  id: number;
  weight_grams: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  qty: number;
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
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { order_id }: ComputeWeightsRequest = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: orderItems, error: itemsError } = await supabase
      .from("order_items")
      .select("qty, item:items(id, weight_grams, length_cm, width_cm, height_cm)")
      .eq("order_id", order_id);

    if (itemsError) throw itemsError;

    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("id, value")
      .in("id", ["default_packaging_weight_grams", "volumetric_divisor", "weight_rounding_grams"]);

    if (settingsError) throw settingsError;

    const settingsMap: Record<string, number> = {};
    settings?.forEach((s) => {
      settingsMap[s.id] = Number(s.value);
    });

    const packagingWeight = settingsMap.default_packaging_weight_grams || 50;
    const volumetricDivisor = settingsMap.volumetric_divisor || 5000;
    const weightRounding = settingsMap.weight_rounding_grams || 500;

    let totalActualWeight = 0;
    let maxLength = 0;
    let maxWidth = 0;
    let maxHeight = 0;

    for (const orderItem of orderItems || []) {
      const item = (orderItem as any).item;
      if (!item) continue;

      totalActualWeight += item.weight_grams * orderItem.qty;

      if (item.length_cm) maxLength = Math.max(maxLength, item.length_cm);
      if (item.width_cm) maxWidth = Math.max(maxWidth, item.width_cm);
      if (item.height_cm) maxHeight = Math.max(maxHeight, item.height_cm);
    }

    const packageCount = 1;
    const actualWeight = totalActualWeight + (packagingWeight * packageCount);

    let volumetricGrams = 0;
    if (maxLength > 0 && maxWidth > 0 && maxHeight > 0) {
      const volumeCm3 = maxLength * maxWidth * maxHeight;
      const volumetricKg = volumeCm3 / volumetricDivisor;
      volumetricGrams = Math.round(volumetricKg * 1000);
    }

    let billedWeight = Math.max(actualWeight, volumetricGrams);
    billedWeight = Math.ceil(billedWeight / weightRounding) * weightRounding;

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        package_count: packageCount,
        package_weight_grams: actualWeight,
        package_volumetric_grams: volumetricGrams,
        billed_weight_grams: billedWeight,
      })
      .eq("id", order_id);

    if (updateError) throw updateError;

    const { error: parcelError } = await supabase
      .from("courier_parcels")
      .upsert({
        order_id,
        parcel_index: 0,
        actual_weight_grams: actualWeight,
        length_cm: maxLength > 0 ? maxLength : null,
        width_cm: maxWidth > 0 ? maxWidth : null,
        height_cm: maxHeight > 0 ? maxHeight : null,
        volumetric_grams: volumetricGrams,
        billed_weight_grams: billedWeight,
      });

    if (parcelError) throw parcelError;

    return new Response(
      JSON.stringify({
        success: true,
        order_id,
        package_count: packageCount,
        actual_weight_grams: actualWeight,
        volumetric_grams: volumetricGrams,
        billed_weight_grams: billedWeight,
        dimensions: {
          length_cm: maxLength,
          width_cm: maxWidth,
          height_cm: maxHeight,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error computing weights:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
