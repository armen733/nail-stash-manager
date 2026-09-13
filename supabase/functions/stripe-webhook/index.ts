import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?deno-std=0.190.0";
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
        const rawSession = event.data.object as Stripe.Checkout.Session;
        const orderId = rawSession.metadata?.order_id;
        const customerEmail = rawSession.customer_email || rawSession.customer_details?.email;
        const customerName = rawSession.customer_details?.name;

        console.log('Checkout session completed:', { id: rawSession.id, orderId, customerEmail });

        if (orderId) {
          // Order row already exists (created before checkout) — just confirm it.
          const { error } = await supabase
            .from('orders')
            .update({
              status: 'Confirmed',
              customer_email: customerEmail,
              customer_name: customerName,
              stripe_session_id: rawSession.id,
            })
            .eq('id', orderId);

          if (error) console.error('Failed to update order:', error);
          break;
        }

        // Safety net: the browser normally creates the order after redirect.
        // If it never did (tab closed, network error), create it here.
        try {
          const session = await stripe.checkout.sessions.retrieve(rawSession.id, {
            expand: ['line_items', 'line_items.data.price.product', 'customer_details'],
          });
          const result = await createOrderFromSession(session, supabase);
          console.log('Webhook order result:', result);
        } catch (createErr) {
          console.error('Webhook failed to create order:', createErr);
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
