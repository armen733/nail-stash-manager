import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?deno-std=0.190.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] stripe-hosted-checkout: Request received`);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[${requestId}] Step 1: Checking Stripe key`);
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error(`[${requestId}] Stripe key not configured`);
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    console.log(`[${requestId}] Step 2: Initializing Stripe client`);
    const stripe = new Stripe(stripeKey, { 
      apiVersion: "2023-10-16",
      maxNetworkRetries: 2,
    });

    console.log(`[${requestId}] Step 3: Initializing Supabase client`);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    console.log(`[${requestId}] Step 4: Parsing request body`);
    const { items, customerEmail, customerName, customerPhone, metadata, taxAmount, shippingAmount, shippingZone } = await req.json();
    console.log(`[${requestId}] Tax: ${taxAmount}, Shipping: ${shippingAmount}, Zone: ${shippingZone}, Phone: ${customerPhone || 'none'}`);

    if (!items?.length) {
      console.error(`[${requestId}] No items in request`);
      return new Response(JSON.stringify({ error: "No items" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    console.log(`[${requestId}] Items count: ${items.length}, Customer: ${customerEmail || 'guest'}`);

    console.log(`[${requestId}] Step 5: Checking auth`);
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authError) {
        console.warn(`[${requestId}] Auth error (non-fatal): ${authError.message}`);
      }
      userId = data.user?.id ?? null;
    }
    console.log(`[${requestId}] User ID: ${userId || 'anonymous'}`);

    console.log(`[${requestId}] Step 6: Finding or creating Stripe customer`);
    let customerId: string | undefined;
    if (customerEmail) {
      try {
        const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
          console.log(`[${requestId}] Found existing customer: ${customerId}`);
        } else {
          const customer = await stripe.customers.create({ email: customerEmail, name: customerName });
          customerId = customer.id;
          console.log(`[${requestId}] Created new customer: ${customerId}`);
        }
      } catch (customerErr) {
        console.error(`[${requestId}] Customer lookup/create failed: ${customerErr instanceof Error ? customerErr.message : customerErr}`);
        // Continue without customer - not fatal
      }
    }

    console.log(`[${requestId}] Step 7: Building line items`);
    const lineItems = items.map((item: any) => ({
      price_data: {
        currency: "usd",
        product_data: { name: item.name, images: item.image ? [item.image] : [] },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    if (taxAmount && Number(taxAmount) > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Sales Tax (9.5%)" },
          unit_amount: Math.round(Number(taxAmount) * 100),
        },
        quantity: 1,
      });
    }

    if (shippingAmount && Number(shippingAmount) > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: `Shipping${shippingZone ? ` (${shippingZone})` : ""}` },
          unit_amount: Math.round(Number(shippingAmount) * 100),
        },
        quantity: 1,
      });
    }

    // Prepare order items with product_id for stock reduction (compact format to fit 500 char limit)
    const orderItems = items.map((item: any) => ({
      n: item.name?.substring(0, 30), // truncate name
      id: item.id,
      q: item.quantity,
      p: item.price,
    }));
    
    // Stringify and check if it fits in metadata (500 char limit)
    let orderItemsJson = JSON.stringify(orderItems);
    if (orderItemsJson.length > 490) {
      // If still too long, only include essential data
      const minimalItems = items.map((item: any) => ({
        id: item.id,
        q: item.quantity,
        p: item.price,
      }));
      orderItemsJson = JSON.stringify(minimalItems);
    }
    console.log(`[${requestId}] Order items JSON length: ${orderItemsJson.length}`);

    const origin = req.headers.get("origin") || "https://nail-boutique-shop.lovable.app";
    console.log(`[${requestId}] Origin: ${origin}`);

    console.log(`[${requestId}] Step 8: Creating Stripe checkout session`);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : customerEmail,
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ["US", "CA", "GB", "AU"] },
      metadata: { 
        ...(metadata || {}), 
        userId: userId || "",
        orderItems: orderItemsJson,
        taxAmount: String(taxAmount ?? 0),
        shippingAmount: String(shippingAmount ?? 0),
        shippingZone: shippingZone || "",
      },
    });

    console.log(`[${requestId}] Success: Session created ${session.id}`);
    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error(`[${requestId}] Fatal error: ${errorMessage}`);
    if (errorStack) {
      console.error(`[${requestId}] Stack: ${errorStack}`);
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
