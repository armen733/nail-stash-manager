import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?deno-std=0.190.0";
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
    
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    
    // Note: shipping_details is NOT expandable - it's included automatically if shipping was collected
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'line_items.data.price.product', 'customer_details']
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
    
    // Prefer shipping address from metadata (customer app validated it & calculated shipping fee).
    // Fall back to Stripe's billing/shipping details only if metadata is missing.
    const md = session.metadata || {};
    let shippingAddress: string;
    if (md.shipping_address || md.shipping_city || md.shipping_zip) {
      const line1 = md.shipping_address || '';
      const cityStateZip = [
        md.shipping_city || '',
        [md.shipping_state, md.shipping_zip].filter(Boolean).join(' ')
      ].filter(Boolean).join(', ');
      shippingAddress = [line1, cityStateZip, md.shipping_country || '']
        .filter(Boolean)
        .join('\n');
    } else {
      const shipping = session.shipping_details || session.customer_details;
      shippingAddress = shipping?.address
        ? `${shipping.address.line1 || ''}${shipping.address.line2 ? ', ' + shipping.address.line2 : ''}\n${shipping.address.city || ''}, ${shipping.address.state || ''} ${shipping.address.postal_code || ''}\n${shipping.address.country || ''}`
        : md.shippingAddress || 'No address provided';
    }

    const taxAmount = Number(md.taxAmount || 0);
    const shippingAmount = Number(md.shippingAmount || 0);

    const lineItems = session.line_items?.data || [];
    const subtotal = (session.amount_subtotal || 0) / 100;
    
    // Parse orderItems from metadata if available (includes image_url from customer app)
    let metadataItems: any[] = [];
    if (session.metadata?.orderItems) {
      try {
        metadataItems = JSON.parse(session.metadata.orderItems);
        logStep('Parsed metadata items', { 
          count: metadataItems.length,
          rawMetadata: session.metadata.orderItems.substring(0, 500),
          imageUrls: metadataItems.map((item: any) => ({ name: item.name, image_url: item.image_url }))
        });
      } catch (e) {
        logStep('Failed to parse metadata items', { error: e });
      }
    } else {
      logStep('No orderItems in metadata', { metadataKeys: Object.keys(session.metadata || {}) });
    }
    
    logStep('Creating order', { customerEmail, itemCount: lineItems.length, total, userId });

    const orderData: Record<string, any> = {
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      customer_address: shippingAddress,
      subtotal: subtotal,
      tax: taxAmount,
      shipping: shippingAmount,
      shipping_zone: md.shippingZone || null,
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

    // Use metadata items if available, otherwise fall back to Stripe line items
    // Metadata uses compact format: n=name, id=product_id, q=quantity, p=price
    const orderItemsInfo = metadataItems.length > 0 
      ? metadataItems.map((item: any) => ({
          product_id: item.product_id || item.id || null,
          product_name: item.name || item.n || item.product_name || 'Unknown Product',
          quantity: item.quantity || item.q || 1,
          unit_price: item.price || item.p || item.unit_price || 0,
          line_total: (item.price || item.p || item.unit_price || 0) * (item.quantity || item.q || 1),
          image_url: item.image_url || null,
        }))
      : lineItems.map((item: any) => ({
          product_id: null,
          product_name: item.description || (item.price?.product as any)?.name || 'Unknown Product',
          quantity: item.quantity || 1,
          unit_price: (item.price?.unit_amount || 0) / 100,
          line_total: (item.amount_total || 0) / 100,
          image_url: (item.price?.product as any)?.images?.[0] || null,
        }));
    
    logStep('Order items prepared', { count: orderItemsInfo.length, hasImages: orderItemsInfo.some((i: any) => i.image_url) });

    // Insert order items into order_items table
    const orderItemsToInsert = orderItemsInfo
      .filter((item: any) => item.product_id)
      .map((item: any) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
      }));

    if (orderItemsToInsert.length > 0) {
      const { error: itemsInsertError } = await supabase
        .from('order_items')
        .insert(orderItemsToInsert);
      
      if (itemsInsertError) {
        logStep('Failed to insert order items', { error: itemsInsertError.message });
      } else {
        logStep('Order items inserted', { count: orderItemsToInsert.length });
      }
    }

    // Reduce stock from default (Main) warehouse via stock_movements.
    // The DB trigger keeps products.stock_on_hand in sync.
    try {
      const { data: defaultLoc } = await supabase
        .from('stock_locations')
        .select('id')
        .eq('is_default', true)
        .eq('is_active', true)
        .maybeSingle();

      const fromLocId = defaultLoc?.id ?? null;
      if (fromLocId) {
        const movementRows = orderItemsInfo
          .filter((it: any) => it.product_id)
          .map((it: any) => ({
            product_id: it.product_id,
            movement_type: 'sale',
            quantity: it.quantity,
            from_location_id: fromLocId,
            to_location_id: null,
            unit_cost: it.unit_price ?? null,
            reason: `Stripe order ${order.id.slice(0, 8)}`,
            reference_type: 'stripe_order',
            reference_id: order.id,
          }));

        if (movementRows.length > 0) {
          const { error: mvErr } = await supabase.from('stock_movements').insert(movementRows);
          if (mvErr) {
            logStep('Failed to insert stock movements', { error: mvErr.message });
          } else {
            logStep('Stock movements inserted', { count: movementRows.length });
          }
        }
      } else {
        logStep('No default warehouse found; skipping stock deduction');
      }
    } catch (stockErr) {
      logStep('Stock movement error', { error: stockErr });
    }

    // Check for referral and create commission
    if (userId) {
      try {
        const { data: referral } = await supabase
          .from('customer_referrals')
          .select('referrer_id, referrers(commission_rate, total_revenue, total_commission)')
          .eq('customer_id', userId)
          .maybeSingle();

        if (referral && referral.referrer_id) {
          const referrer = referral.referrers as any;
          const commissionRate = referrer?.commission_rate || 10;
          const commissionAmount = (subtotal * commissionRate) / 100;

          const { error: commError } = await supabase
            .from('referral_commissions')
            .insert({
              referrer_id: referral.referrer_id,
              customer_id: userId,
              order_id: order.id,
              order_subtotal: subtotal,
              commission_rate: commissionRate,
              commission_amount: commissionAmount,
              status: 'pending',
            });

          if (commError) {
            logStep('Failed to insert referral commission', { error: commError.message });
          } else {
            // Update referrer totals
            const newRevenue = (referrer?.total_revenue || 0) + subtotal;
            const newCommission = (referrer?.total_commission || 0) + commissionAmount;
            await supabase
              .from('referrers')
              .update({ total_revenue: newRevenue, total_commission: newCommission })
              .eq('id', referral.referrer_id);
            logStep('Referral commission created', { referrerId: referral.referrer_id, commissionAmount });
          }
        }
      } catch (refErr) {
        logStep('Referral check error', { error: refErr });
      }
    }

    // Send Telegram notification
    try {
      const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
      const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
      
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        const orderDate = new Date();
        const formattedDate = orderDate.toLocaleDateString('en-US', { 
          timeZone: 'America/Los_Angeles',
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        });
        const formattedTime = orderDate.toLocaleTimeString('en-US', { 
          timeZone: 'America/Los_Angeles',
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        
        const itemsList = orderItemsInfo.length > 0
          ? orderItemsInfo.map((item: any) => `  • ${item.product_name} x${item.quantity} - $${item.line_total.toFixed(2)}`).join('\n')
          : '  No items';
        
        const telegramMessage = `━━━━━━━━━━━━━━━━━━━━
🛒 NEW ORDER RECEIVED!

📦 Order ID: ${order.id.slice(0, 8).toUpperCase()}

👤 Customer:
• Name: ${customerName}
• Email: ${customerEmail}
• Phone: ${customerPhone || 'N/A'}

📍 Shipping Address:
${shippingAddress}

🛍️ Items:
${itemsList}

💰 Order Summary:
• Subtotal: $${subtotal.toFixed(2)}
• Total: $${total.toFixed(2)}

📅 ${formattedDate}, ${formattedTime}

💳 Paid via Stripe Checkout
━━━━━━━━━━━━━━━━━━━━`;

        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: telegramMessage,
            parse_mode: 'HTML'
          })
        });
        logStep('Telegram notification sent');
      }
    } catch (telegramErr) {
      logStep('Telegram error', { error: telegramErr });
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
            image_url: item.image_url,
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
