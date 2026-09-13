import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?deno-std=0.190.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createOrderFromSession } from "../_shared/stripe-order.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SESSION_EXPAND = ['line_items', 'line_items.data.price.product', 'customer_details'];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const { sessionId, paymentIntentId } = await req.json();

    if (!sessionId && !paymentIntentId) {
      throw new Error('Session ID or payment intent ID is required');
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured');

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    let session: any;
    if (sessionId) {
      session = await stripe.checkout.sessions.retrieve(sessionId, { expand: SESSION_EXPAND });
    } else {
      // Recovery path: find the checkout session behind a payment intent
      const list = await stripe.checkout.sessions.list({
        payment_intent: paymentIntentId,
        limit: 1,
      });
      const found = list.data[0];
      if (!found) throw new Error('No checkout session found for that payment');
      session = await stripe.checkout.sessions.retrieve(found.id, { expand: SESSION_EXPAND });
    }


    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { orderId, alreadyProcessed } = await createOrderFromSession(session, supabase);

    return new Response(
      JSON.stringify({
        success: true,
        orderId,
        alreadyProcessed,
        orderNumber: orderId.slice(0, 8).toUpperCase(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PROCESS-STRIPE-SESSION] ERROR', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
