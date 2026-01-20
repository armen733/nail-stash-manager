import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const body = await req.json();
    const { orderId, orderData } = body;
    
    console.log('=== NEW ORDER NOTIFICATION ===');
    console.log('Order ID:', orderId);

    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');
    
    if (!telegramBotToken || !telegramChatId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Telegram credentials not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const itemsList = orderData.items?.map((item: any) => 
      `  • ${item.product_name} x${item.quantity} - $${item.line_total.toFixed(2)}`
    ).join('\n') || 'No items';

    const isInStore = orderData.customer_address === 'In-Store Pickup';
    
    const message = `━━━━━━━━━━━━━━━━━━
🛒 *NEW ORDER RECEIVED!*
━━━━━━━━━━━━━━━━━━

📦 *Order ID:* \`${orderId.slice(0, 8).toUpperCase()}\`

👤 *Customer:*
• Name: ${orderData.customer_name || 'Walk-in'}
• Email: ${orderData.customer_email || 'N/A'}
• Phone: ${orderData.customer_phone || 'N/A'}

📍 *${isInStore ? 'Pickup' : 'Shipping'}:*
${orderData.customer_address || 'N/A'}

🛍️ *Items:*
${itemsList}

💰 *Order Summary:*
• Subtotal: $${orderData.subtotal?.toFixed(2) || '0.00'}
${orderData.discount_code ? `• Discount (${orderData.discount_code}): -$${orderData.discount_amount?.toFixed(2) || '0.00'}` : ''}
${orderData.points_redeemed ? `• Points Redeemed: ${orderData.points_redeemed} pts` : ''}
• *Total: $${orderData.total?.toFixed(2) || '0.00'}*

${orderData.notes ? `📝 *Notes:* ${orderData.notes}\n` : ''}📅 ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}

${isInStore ? '🏪 In-Store Quick Order' : '💳 Online Order'}
━━━━━━━━━━━━━━━━━━`;

    const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Telegram API error', details: responseData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Telegram notification sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
