import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PROCESS-STRIPE-SESSION] ${step}${detailsStr}`);
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const { sessionId } = await req.json();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    logStep('Processing session', { sessionId });

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'line_items.data.price.product', 'customer_details', 'shipping_details']
    });
    
    logStep('Session retrieved', { 
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email 
    });

    if (session.payment_status !== 'paid') {
      throw new Error('Payment not completed');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const customerEmail = session.customer_details?.email || session.customer_email || '';
    const total = (session.amount_total || 0) / 100;
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentOrders } = await supabase
      .from('orders')
      .select('id, created_at')
      .eq('customer_email', customerEmail)
      .eq('total', total)
      .gte('created_at', fiveMinutesAgo)
      .limit(1);

    if (recentOrders && recentOrders.length > 0) {
      logStep('Order likely already exists', { orderId: recentOrders[0].id });
      return new Response(
        JSON.stringify({ success: true, orderId: recentOrders[0].id, alreadyProcessed: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const customerName = session.customer_details?.name || session.metadata?.customerName || 'Guest Customer';
    const customerPhone = session.customer_details?.phone || '';
    const userId = session.metadata?.userId || null;
    
    const shipping = session.shipping_details || session.customer_details;
    const shippingAddress = shipping?.address ? 
      `${shipping.address.line1 || ''}${shipping.address.line2 ? ', ' + shipping.address.line2 : ''}\n${shipping.address.city || ''}, ${shipping.address.state || ''} ${shipping.address.postal_code || ''}\n${shipping.address.country || ''}` :
      session.metadata?.shippingAddress || 'No address provided';

    const lineItems = session.line_items?.data || [];
    const subtotal = (session.amount_subtotal || 0) / 100;
    
    logStep('Creating order', { customerEmail, itemCount: lineItems.length, total, userId });

    const orderData: Record<string, any> = {
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      customer_address: shippingAddress,
      subtotal: subtotal,
      tax: 0,
      total: total,
      status: 'Confirmed',
    };
    
    if (userId) {
      orderData.profile_id = userId;
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      logStep('Order creation failed', { error: orderError.message });
      throw orderError;
    }

    logStep('Order created', { orderId: order.id });

    const orderItemsInfo = lineItems.map((item: any) => ({
      product_name: item.description || (item.price?.product as any)?.name || 'Unknown Product',
      quantity: item.quantity || 1,
      unit_price: (item.price?.unit_amount || 0) / 100,
      line_total: (item.amount_total || 0) / 100,
    }));
    
    logStep('Order items prepared', { count: orderItemsInfo.length });

    // Send Telegram notification
    try {
      const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');

      if (telegramBotToken && telegramChatId) {
        const itemsList = orderItemsInfo.map((item: any) => 
          `  • ${item.product_name} x${item.quantity} - $${item.line_total.toFixed(2)}`
        ).join('\n');

        const message = `🛒 *NEW ORDER RECEIVED!*

📦 *Order ID:* \`${order.id.slice(0, 8).toUpperCase()}\`

👤 *Customer:*
• Name: ${customerName}
• Email: ${customerEmail}
• Phone: ${customerPhone || 'N/A'}

📍 *Shipping Address:*
${shippingAddress}

🛍️ *Items:*
${itemsList}

💰 *Order Summary:*
• Subtotal: $${subtotal.toFixed(2)}
• *Total: $${total.toFixed(2)}*

📅 ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}

💳 *Paid via Stripe Checkout*`;

        const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
        await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: message,
            parse_mode: 'Markdown',
          }),
        });
        logStep('Telegram notification sent');
      }
    } catch (telegramError) {
      logStep('Telegram error', { error: telegramError });
    }

    // Send confirmation email
    try {
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          type: 'order_confirmation',
          email: customerEmail,
          customerName: customerName,
          orderId: order.id,
          orderItems: orderItemsInfo.map((item: any) => ({
            name: item.product_name,
            quantity: item.quantity,
            price: item.unit_price,
          })),
          subtotal: subtotal,
          total: total,
          shippingAddress: shippingAddress,
        }
      });
      logStep('Email notification sent');
    } catch (emailErr) {
      logStep('Email error', { error: emailErr });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        orderId: order.id,
        orderNumber: order.id.slice(0, 8).toUpperCase()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logStep('ERROR', { message: errorMessage });
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
