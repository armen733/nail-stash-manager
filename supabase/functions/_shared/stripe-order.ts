// Shared: create an internal order from a paid Stripe Checkout Session.
// Used by process-stripe-session (browser return) AND stripe-webhook (server-side
// safety net) so a paid checkout always produces an order even if the customer
// closes the tab or the browser call fails.

const log = (step: string, details?: unknown) => {
  console.log(`[STRIPE-ORDER] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

export async function createOrderFromSession(
  session: any,
  supabase: any,
): Promise<{ orderId: string; alreadyProcessed: boolean }> {
  if (session.payment_status !== 'paid') {
    throw new Error('Payment not completed');
  }

  const md = session.metadata || {};
  const customerEmail = session.customer_details?.email || session.customer_email || '';
  const total = (session.amount_total || 0) / 100;

  // Idempotency 1: same checkout session already recorded
  const { data: existingBySession } = await supabase
    .from('orders')
    .select('id')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  if (existingBySession) {
    log('Order already exists for session', { orderId: existingBySession.id });
    return { orderId: existingBySession.id, alreadyProcessed: true };
  }

  // Idempotency 2: legacy fallback (orders created before session ids were stored)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('customer_email', customerEmail)
    .eq('total', total)
    .gte('created_at', tenMinutesAgo)
    .limit(1);

  if (recentOrders && recentOrders.length > 0) {
    await supabase
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', recentOrders[0].id)
      .is('stripe_session_id', null);
    log('Order likely already exists (recent match)', { orderId: recentOrders[0].id });
    return { orderId: recentOrders[0].id, alreadyProcessed: true };
  }

  const customerName = session.customer_details?.name || md.customerName || 'Guest Customer';
  const customerPhone = session.customer_details?.phone || '';
  const userId = md.userId || null;

  let shippingAddress: string;
  if (md.shipping_address || md.shipping_city || md.shipping_zip) {
    const line1 = md.shipping_address || '';
    const cityStateZip = [
      md.shipping_city || '',
      [md.shipping_state, md.shipping_zip].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ');
    shippingAddress = [line1, cityStateZip, md.shipping_country || ''].filter(Boolean).join('\n');
  } else {
    const shipping = session.shipping_details || session.customer_details;
    shippingAddress = shipping?.address
      ? `${shipping.address.line1 || ''}${shipping.address.line2 ? ', ' + shipping.address.line2 : ''}\n${shipping.address.city || ''}, ${shipping.address.state || ''} ${shipping.address.postal_code || ''}\n${shipping.address.country || ''}`
      : md.shippingAddress || 'No address provided';
  }

  const taxAmount = Number(md.taxAmount || 0);
  const shippingAmount = Number(md.shippingAmount || 0);
  const discountAmount = (session.total_details?.amount_discount ?? 0) / 100 || Number(md.discountAmount || 0);
  const discountCode = md.discountCode || null;

  const lineItems = session.line_items?.data || [];
  // amount_subtotal includes the tax & shipping line items we push into the session,
  // so strip them out to store the true product subtotal.
  const rawSubtotal = (session.amount_subtotal || 0) / 100;
  const subtotal = Math.max(0, Number((rawSubtotal - taxAmount - shippingAmount).toFixed(2)));

  let metadataItems: any[] = [];
  if (md.orderItems) {
    try {
      metadataItems = JSON.parse(md.orderItems);
    } catch (e) {
      log('Failed to parse metadata items', { error: String(e) });
    }
  }

  const orderData: Record<string, any> = {
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    customer_address: shippingAddress,
    subtotal,
    tax: taxAmount,
    shipping: shippingAmount,
    shipping_zone: md.shippingZone || null,
    discount_amount: discountAmount || 0,
    discount_code: discountCode,
    total,
    status: 'Confirmed',
    stripe_session_id: session.id,
  };
  if (userId) orderData.profile_id = userId;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert(orderData)
    .select()
    .single();

  if (orderError) {
    // Unique violation => another path created it concurrently
    if ((orderError as any).code === '23505') {
      const { data: dup } = await supabase
        .from('orders')
        .select('id')
        .eq('stripe_session_id', session.id)
        .maybeSingle();
      if (dup) return { orderId: dup.id, alreadyProcessed: true };
    }
    log('Order creation failed', { error: orderError.message });
    throw orderError;
  }

  log('Order created', { orderId: order.id });

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
        product_name: item.description || item.price?.product?.name || 'Unknown Product',
        quantity: item.quantity || 1,
        unit_price: (item.price?.unit_amount || 0) / 100,
        line_total: (item.amount_total || 0) / 100,
        image_url: item.price?.product?.images?.[0] || null,
      }));

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
    const { error: itemsInsertError } = await supabase.from('order_items').insert(orderItemsToInsert);
    if (itemsInsertError) log('Failed to insert order items', { error: itemsInsertError.message });
  }

  // Reduce stock from the default warehouse
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
        if (mvErr) log('Failed to insert stock movements', { error: mvErr.message });
      }
    }
  } catch (stockErr) {
    log('Stock movement error', { error: String(stockErr) });
  }

  // Referral commission
  if (userId) {
    try {
      const { data: referral } = await supabase
        .from('customer_referrals')
        .select('referrer_id, referrers(commission_rate, total_revenue, total_commission)')
        .eq('customer_id', userId)
        .maybeSingle();

      if (referral?.referrer_id) {
        const referrer = referral.referrers as any;
        const commissionRate = referrer?.commission_rate || 10;
        const commissionAmount = (subtotal * commissionRate) / 100;

        const { error: commError } = await supabase.from('referral_commissions').insert({
          referrer_id: referral.referrer_id,
          customer_id: userId,
          order_id: order.id,
          order_subtotal: subtotal,
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          status: 'pending',
        });

        if (!commError) {
          await supabase
            .from('referrers')
            .update({
              total_revenue: (referrer?.total_revenue || 0) + subtotal,
              total_commission: (referrer?.total_commission || 0) + commissionAmount,
            })
            .eq('id', referral.referrer_id);
        }
      }
    } catch (refErr) {
      log('Referral check error', { error: String(refErr) });
    }
  }

  // Telegram notification
  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-US', {
        timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
      });
      const formattedTime = now.toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true,
      });

      // Look up SKUs for ordered products
      let skuById: Record<string, string> = {};
      const productIds = [...new Set(orderItemsInfo.map((it: any) => it.product_id).filter(Boolean))];
      if (productIds.length > 0) {
        const { data: prods } = await supabase.from('products').select('id, sku').in('id', productIds);
        for (const p of prods || []) skuById[p.id] = p.sku;
      }

      const itemsList = orderItemsInfo.length > 0
        ? orderItemsInfo.map((item: any) => {
            const sku = item.sku || skuById[item.product_id] || '';
            return `  • ${item.product_name}${sku ? ` (${sku})` : ''} x${item.quantity} - $${item.line_total.toFixed(2)}`;
          }).join('\n')
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
${discountAmount > 0 ? `• Discount${discountCode ? ` (${discountCode})` : ''}: -$${discountAmount.toFixed(2)}${subtotal > 0 ? ` (${Math.round((discountAmount / subtotal) * 100)}% off)` : ''}\n` : ''}• Shipping${md.shippingZone ? ` (${md.shippingZone})` : ''}: ${shippingAmount > 0 ? `$${shippingAmount.toFixed(2)}` : 'FREE'}
• Tax: $${taxAmount.toFixed(2)}
• Total: $${total.toFixed(2)}

📅 ${formattedDate}, ${formattedTime}

💳 Paid via Stripe Checkout
━━━━━━━━━━━━━━━━━━━━`;

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: telegramMessage }),
      });
      log('Telegram notification sent');
    }
  } catch (telegramErr) {
    log('Telegram error', { error: String(telegramErr) });
  }

  // Confirmation email
  try {
    await supabase.functions.invoke('send-transactional-email', {
      body: {
        type: 'order_confirmation',
        email: customerEmail,
        customerName,
        orderId: order.id,
        orderItems: orderItemsInfo.map((item: any) => ({
          name: item.product_name,
          quantity: item.quantity,
          price: item.unit_price,
          image_url: item.image_url,
        })),
        subtotal,
        total,
        shippingAddress,
      },
    });
  } catch (emailErr) {
    log('Email error', { error: String(emailErr) });
  }

  return { orderId: order.id, alreadyProcessed: false };
}
