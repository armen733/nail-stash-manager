import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id, status, customer_name, customer_email, customer_address, order_date,
        order_items ( quantity, unit_price, line_total,
          products ( name, image_url, product_images ( image_url, display_order ) )
        )
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      console.error("order lookup failed", orderId, error);
      return new Response(JSON.stringify({ error: "order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (order.status !== "Shipped") {
      console.log("order not shipped, skipping", orderId, order.status);
      return new Response(JSON.stringify({ skipped: "not_shipped" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order.customer_email) {
      console.log("no customer email, skipping", orderId);
      return new Response(JSON.stringify({ skipped: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = (order.order_items || []).map((item: any) => {
      const product = item.products;
      const gallery = product?.product_images as Array<{ image_url: string; display_order: number }> | undefined;
      const galleryImage = gallery && gallery.length > 0
        ? [...gallery].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0].image_url
        : null;
      return {
        name: product?.name || "Product",
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        image_url: galleryImage || product?.image_url || undefined,
      };
    });

    const { data, error: sendError } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        type: "order_shipped",
        email: order.customer_email,
        name: order.customer_name,
        orderId: order.id,
        shippingAddress: order.customer_address,
        items,
      },
    });

    if (sendError) {
      console.error("send failed", sendError);
      return new Response(JSON.stringify({ error: String(sendError) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("shipped email sent for", orderId);
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("unexpected error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
