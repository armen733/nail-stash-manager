import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// In-memory cache for recent payment intents (TTL: 5 minutes)
// Key: idempotencyKey, Value: { clientSecret, paymentIntentId, timestamp }
const recentPaymentIntents = new Map<string, { clientSecret: string; paymentIntentId: string; timestamp: number }>();

// Cleanup old entries (older than 5 minutes)
function cleanupCache() {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [key, value] of recentPaymentIntents.entries()) {
    if (value.timestamp < fiveMinutesAgo) {
      recentPaymentIntents.delete(key);
    }
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    
    if (!STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Stripe is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-08-27.basil',
    });

    const { amount, currency = 'usd', metadata = {}, idempotencyKey } = await req.json();

    console.log('Creating payment intent for amount:', amount, 'currency:', currency, 'idempotencyKey:', idempotencyKey);

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cleanup old cache entries
    cleanupCache();

    // Check if we already have a payment intent for this idempotency key
    if (idempotencyKey && recentPaymentIntents.has(idempotencyKey)) {
      const cached = recentPaymentIntents.get(idempotencyKey)!;
      console.log('Returning cached payment intent:', cached.paymentIntentId);
      
      const publishableKey = Deno.env.get('STRIPE_PUBLISHABLE_KEY');
      return new Response(
        JSON.stringify({ 
          clientSecret: cached.clientSecret,
          paymentIntentId: cached.paymentIntentId,
          publishableKey: publishableKey,
          cached: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a PaymentIntent with the order amount and currency
    // Use Stripe's built-in idempotency key if provided
    const createOptions: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: metadata,
    };

    const requestOptions: Stripe.RequestOptions = {};
    if (idempotencyKey) {
      requestOptions.idempotencyKey = idempotencyKey;
    }

    const paymentIntent = await stripe.paymentIntents.create(createOptions, requestOptions);

    console.log('Payment intent created:', paymentIntent.id);

    // Cache this payment intent
    if (idempotencyKey) {
      recentPaymentIntents.set(idempotencyKey, {
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id,
        timestamp: Date.now()
      });
    }

    // Get publishable key for frontend
    const publishableKey = Deno.env.get('STRIPE_PUBLISHABLE_KEY');

    return new Response(
      JSON.stringify({ 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        publishableKey: publishableKey
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create payment intent';
    console.error('Error creating payment intent:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
