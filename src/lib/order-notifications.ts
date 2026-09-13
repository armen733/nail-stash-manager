import { supabase } from "@/integrations/supabase/client";

/**
 * Sends the "order shipped" email to the customer after an order is marked Shipped.
 * Fire-and-forget: failures are logged, never thrown, so status updates never break.
 */
export async function sendOrderShippedEmail(orderId: string, previousStatus?: string | null) {
  try {
    if (previousStatus === "Shipped") return; // don't resend on no-op changes

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id,
        customer_name,
        customer_email,
        customer_address,
        order_date,
        order_items (
          quantity,
          unit_price,
          line_total,
          products ( name, image_url, product_images ( image_url, display_order ) )
        )
      `)
      .eq("id", orderId)
      .single();

    if (error || !order) {
      console.warn("sendOrderShippedEmail: order not found", orderId, error);
      return;
    }

    if (!order.customer_email) {
      console.log("sendOrderShippedEmail: no customer email, skipping", orderId);
      return;
    }

    const items = (order.order_items || []).map((item: any) => {
      const product = item.products;
      const gallery = product?.product_images as Array<{ image_url: string; display_order: number }> | undefined;
      const galleryImage = gallery && gallery.length > 0
        ? [...gallery].sort((a, b) => a.display_order - b.display_order)[0].image_url
        : null;
      return {
        name: product?.name || "Product",
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        image_url: galleryImage || product?.image_url || undefined,
      };
    });

    const { error: fnError } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        type: "order_shipped",
        email: order.customer_email,
        name: order.customer_name,
        orderId: order.id,
        shippingAddress: order.customer_address,
        items,
      },
    });

    if (fnError) {
      console.error("sendOrderShippedEmail: send failed", fnError);
    } else {
      console.log("sendOrderShippedEmail: sent for order", orderId);
    }
  } catch (err) {
    console.error("sendOrderShippedEmail: unexpected error", err);
  }
}

/** Sends shipped emails for multiple orders (bulk status updates). */
export async function sendOrderShippedEmails(orderIds: string[], orders?: Array<{ id: string; status: string }>) {
  await Promise.allSettled(
    orderIds.map((id) => {
      const prev = orders?.find((o) => o.id === id)?.status ?? null;
      return sendOrderShippedEmail(id, prev);
    })
  );
}
