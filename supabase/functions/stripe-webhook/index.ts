import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      console.error('Stripe keys not configured');
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      console.error('No stripe signature');
      return new Response(
        JSON.stringify({ error: 'No signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Received Stripe event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id;
        const customerEmail = session.customer_email || session.customer_details?.email;
        const customerName = session.customer_details?.name;

        console.log('Checkout session completed:', { orderId, customerEmail, customerName });

        if (orderId) {
          // Update order status
          const { error } = await supabase
            .from('orders')
            .update({ 
              status: 'Confirmed',
              customer_email: customerEmail,
              customer_name: customerName
            })
            .eq('id', orderId);

          if (error) {
            console.error('Failed to update order:', error);
          } else {
            console.log('Order updated to Confirmed:', orderId);

            // Fetch order with items for notifications
            const { data: order } = await supabase
              .from('orders')
              .select('*')
              .eq('id', orderId)
              .single();

            const { data: orderItems } = await supabase
              .from('order_items')
              .select(`
                quantity,
                unit_price,
                line_total,
                products (
                  name,
                  image_url
                )
              `)
              .eq('order_id', orderId);

            // Telegram notification is handled by process-stripe-session with "Paid via Stripe" format

            // Send confirmation email with product thumbnails
            if (customerEmail && order) {
              try {
                const emailItems = (orderItems || []).map((item: any) => ({
                  name: item.products?.name || 'Product',
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  line_total: item.line_total,
                  image_url: item.products?.image_url || null
                }));

                await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                  },
                  body: JSON.stringify({
                    type: 'order_confirmation',
                    email: customerEmail,
                    name: customerName || order.customer_name || 'Customer',
                    orderId: order.id,
                    orderDate: new Date(order.order_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }),
                    items: emailItems,
                    subtotal: order.subtotal,
                    discount: order.discount_amount || 0,
                    discountCode: order.discount_code || null,
                    tax: order.tax,
                    total: order.total,
                    pointsEarned: order.points_earned || 0
                  })
                });
                console.log('Confirmation email sent to:', customerEmail);
              } catch (emailError) {
                console.error('Failed to send confirmation email:', emailError);
              }
            }
          }
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const orderId = paymentIntent.metadata?.order_id;

        console.log('Payment intent succeeded for order:', orderId);
        // Order already handled by checkout.session.completed, this is a backup
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const orderId = paymentIntent.metadata?.order_id;

        console.log('Payment failed for order:', orderId);

        if (orderId) {
          const { error } = await supabase
            .from('orders')
            .update({ 
              status: 'Draft'
            })
            .eq('id', orderId);

          if (error) {
            console.error('Failed to update order:', error);
          }
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
