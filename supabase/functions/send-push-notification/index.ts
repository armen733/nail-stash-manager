import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

interface OrderDetails {
  orderId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  total?: number;
  orderDate?: string;
}

// Send Telegram notification with full order details
async function sendTelegramNotification(order: OrderDetails): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram not configured, skipping');
    return false;
  }

  try {
    const name = order.customerName || 'Customer';
    const phone = order.customerPhone || 'Not provided';
    const email = order.customerEmail || 'Not provided';
    const address = order.customerAddress || 'Not provided';
    const total = order.total ? `$${Number(order.total).toFixed(2)}` : 'N/A';
    const date = order.orderDate || new Date().toISOString().split('T')[0];
    
    const message = `🔔 *New Order Received!*

👤 *Customer:* ${name}
📞 *Phone:* ${phone}
✉️ *Email:* ${email}
📍 *Address:* ${address}

💰 *Total:* ${total}
📅 *Date:* ${date}

Check the orders page for full details.`;
    
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        })
      }
    );

    const result = await response.json();
    
    if (result.ok) {
      console.log('Telegram notification sent successfully');
      return true;
    } else {
      console.error('Telegram error:', result.description);
      return false;
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Push notification function called');
    
    let orderDetails: OrderDetails = {};
    try {
      orderDetails = await req.json();
    } catch {}

    console.log('Processing notification for order:', orderDetails.orderId || 'unknown');

    // Send Telegram notification with full details
    const telegramSent = await sendTelegramNotification(orderDetails);
    console.log('Telegram notification result:', telegramSent);

    return new Response(
      JSON.stringify({ 
        message: 'Notification processed', 
        telegram: telegramSent 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
