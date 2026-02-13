import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateOrderRequest {
  school_code: string;
  class_id: number;
  category: 'books' | 'stationery';
  items: Array<{ item_id: number; qty: number }>;
  delivery_type: 'school' | 'home';
  parent_phone: string;
  parent_name?: string;
  address?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestData: CreateOrderRequest = await req.json();
    const { school_code, class_id, items, delivery_type, parent_phone, parent_name, address } = requestData;

    // 1) validate school
    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .select("id")
      .eq("code_4digit", school_code)
      .eq("active", true)
      .maybeSingle();

    if (schoolError) throw schoolError;
    if (!school) {
      return new Response(
        JSON.stringify({ error: "Invalid school code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) load delivery charges from settings (fallback defaults if missing)
    const { data: settings } = await supabase
      .from("settings")
      .select("id, value")
      .in("id", ["school_delivery_charge_paise", "home_delivery_charge_paise"]);

    const settingsMap: Record<string, number> = {};
    (settings || []).forEach((s: any) => {
      settingsMap[s.id] = Number(s.value);
    });

    const delivery_charge_paise = delivery_type === 'school'
      ? (settingsMap.school_delivery_charge_paise ?? 5000) // default ₹50 => 5000 paise
      : (settingsMap.home_delivery_charge_paise ?? 15000); // default ₹150 => 15000 paise

    // 3) fetch items from DB and validate
    const itemIds = items.map(i => i.item_id);
    const { data: itemsData, error: itemsError } = await supabase
      .from("items")
      .select("id, price_paise, stock")
      .in("id", itemIds);

    if (itemsError) throw itemsError;

    let items_total_paise = 0;
    const orderItems: Array<{ item_id: number; qty: number; unit_price_paise: number }> = [];

    for (const orderItem of items) {
      const item = (itemsData || []).find((i: any) => i.id === orderItem.item_id);
      if (!item) {
        return new Response(
          JSON.stringify({ error: `Item ${orderItem.item_id} not found` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (item.stock < orderItem.qty) {
        return new Response(
          JSON.stringify({ error: `Insufficient stock for item ${orderItem.item_id}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      items_total_paise += Number(item.price_paise) * orderItem.qty;
      orderItems.push({
        item_id: orderItem.item_id,
        qty: orderItem.qty,
        unit_price_paise: Number(item.price_paise),
      });
    }

    // 4) compute total
    const total_amount_paise = items_total_paise + delivery_charge_paise;

    // 5) insert order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        school_id: school.id,
        class_id,
        parent_phone,
        parent_name,
        delivery_type,
        delivery_address: address || null,
        delivery_charge_paise,
        items_total_paise,
        total_amount_paise,
        payment_status: 'pending',
        status: 'pending',
        raw_request: requestData,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 6) insert order items
    const orderItemsWithOrderId = orderItems.map(it => ({ ...it, order_id: order.id }));
    const { error: orderItemsError } = await supabase.from("order_items").insert(orderItemsWithOrderId);
    if (orderItemsError) throw orderItemsError;

    // 7) trigger compute-weights function (best-effort, log failure)
    try {
      const computeWeightsUrl = `${supabaseUrl}/functions/v1/compute-weights`;
      const computeWeightsRes = await fetch(computeWeightsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ order_id: order.id }),
      });
      if (!computeWeightsRes.ok) {
        console.error("compute-weights failed:", await computeWeightsRes.text());
      }
    } catch (err) {
      console.error("compute-weights call error:", err);
    }

    // 8) Create Razorpay Payment Link (recommended for sending short URL in WhatsApp)
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    let payment_link: string | null = null;
    let razorpay_payment_link_id: string | null = null;

    if (razorpayKeyId && razorpayKeySecret) {
      try {
        const amount = total_amount_paise; // paise integer
        const customer = {
          name: parent_name || `Parent for order ${order.id}`,
          contact: parent_phone || "",
        };

        const paymentLinkPayload = {
          amount,
          currency: "INR",
          accept_partial: false,
          description: `Order #${order.id}`,
          reference_id: `order_${order.id}`,
          customer,
          notify: { sms: true, email: false },
          notes: {
            order_id: order.id.toString(),
            parent_phone,
          },
        };

        const authHeader = `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`;
        const rLinkRes = await fetch("https://api.razorpay.com/v1/payment_links", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify(paymentLinkPayload),
        });

        const rLinkJson = await rLinkRes.json();

        if (!rLinkRes.ok) {
          console.error("Razorpay payment link error:", rLinkRes.status, rLinkJson);
        } else {
          payment_link = rLinkJson.short_url || rLinkJson.long_url || null;
          razorpay_payment_link_id = rLinkJson.id || null; // this is link_xxx
          // save payment info to order
          await supabase
            .from("orders")
            .update({ payment_id: razorpay_payment_link_id, payment_link })
            .eq("id", order.id);
        }
      } catch (err) {
        console.error("Error creating Razorpay payment link:", err);
      }
    } else {
      console.warn("Razorpay keys not configured - skipping payment link creation.");
    }

    // 9) return result
    return new Response(JSON.stringify({
      success: true,
      order_id: order.id,
      total_amount_paise,
      payment_link: payment_link,
      razorpay_payment_link_id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error creating order:", error);
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
