import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SQUARE_ACCESS_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN');
    const SQUARE_LOCATION_ID = Deno.env.get('SQUARE_LOCATION_ID');
    
    // Log token prefix for debugging (never log full token!)
    console.log('Token prefix:', SQUARE_ACCESS_TOKEN?.substring(0, 10) + '...');
    console.log('Location ID:', SQUARE_LOCATION_ID);
    
    if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
      console.error('Square credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Square is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { sourceId, amount, currency = 'USD', idempotencyKey, customerEmail, note } = await req.json();

    console.log('Creating Square payment for amount:', amount, 'currency:', currency);

    if (!sourceId) {
      return new Response(
        JSON.stringify({ error: 'sourceId (payment token) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!idempotencyKey) {
      return new Response(
        JSON.stringify({ error: 'idempotencyKey is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine Square API base URL (sandbox vs production)
    // If your access token starts with "sandbox-", use sandbox URL
    const isSandbox = SQUARE_ACCESS_TOKEN.startsWith('sandbox-') || SQUARE_ACCESS_TOKEN.startsWith('EAAA');
    const baseUrl = isSandbox 
      ? 'https://connect.squareupsandbox.com' 
      : 'https://connect.squareup.com';

    // Create payment using Square Payments API
    const paymentResponse = await fetch(`${baseUrl}/v2/payments`, {
      method: 'POST',
      headers: {
        'Square-Version': '2024-01-18',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: idempotencyKey,
        amount_money: {
          amount: Math.round(amount * 100), // Convert to cents
          currency: currency.toUpperCase(),
        },
        location_id: SQUARE_LOCATION_ID,
        note: note || undefined,
        buyer_email_address: customerEmail || undefined,
      }),
    });

    const paymentData = await paymentResponse.json();

    if (!paymentResponse.ok) {
      console.error('Square payment error:', paymentData);
      const errorMessage = paymentData.errors?.[0]?.detail || 'Payment failed';
      return new Response(
        JSON.stringify({ error: errorMessage, details: paymentData.errors }),
        { status: paymentResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Square payment created:', paymentData.payment?.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        paymentId: paymentData.payment?.id,
        status: paymentData.payment?.status,
        receiptUrl: paymentData.payment?.receipt_url,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error creating Square payment:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create payment' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
