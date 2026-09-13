import { supabase } from "@/integrations/supabase/client";

/**
 * Triggers the "order shipped" email for an order.
 * The heavy lifting happens server-side (notify-order-shipped), which re-checks
 * the order status, so this is safe to fire-and-forget from any UI path.
 */
export async function sendOrderShippedEmail(orderId: string, previousStatus?: string | null) {
  try {
    if (previousStatus === "Shipped") return; // don't resend on no-op changes

    const { data, error } = await supabase.functions.invoke("notify-order-shipped", {
      body: { orderId },
    });

    if (error) {
      console.error("sendOrderShippedEmail: send failed", error);
    } else {
      console.log("sendOrderShippedEmail: result", orderId, data);
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
