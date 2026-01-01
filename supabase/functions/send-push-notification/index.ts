import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Simple deduplication - track recently processed order IDs
const recentlyProcessed = new Map<string, number>();
const DEDUP_WINDOW_MS = 30000; // 30 seconds

function shouldProcess(orderId: string): boolean {
  if (!orderId) return true; // No ID, process anyway
  
  const now = Date.now();
  const lastProcessed = recentlyProcessed.get(orderId);
  
  // Clean up old entries
  for (const [id, timestamp] of recentlyProcessed.entries()) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentlyProcessed.delete(id);
    }
  }
  
  if (lastProcessed && now - lastProcessed < DEDUP_WINDOW_MS) {
    console.log(`Skipping duplicate notification for order ${orderId}`);
    return false;
  }
  
  recentlyProcessed.set(orderId, now);
  return true;
}

interface OrderDetails {
  orderId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  total?: number;
  orderDate?: string;
}

interface OrderItem {
  quantity: number;
  product: {
    name: string;
    sku: string;
  } | null;
}

// Fetch order items with product details
async function fetchOrderItems(orderId: string): Promise<OrderItem[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Supabase not configured, skipping item fetch');
    return [];
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from('order_items')
      .select('quantity, product:products(name, sku)')
      .eq('order_id', orderId);

    if (error) {
      console.error('Error fetching order items:', error);
      return [];
    }

    // Map the data to handle the nested product object
    return (data || []).map((item: any) => ({
      quantity: item.quantity,
      product: item.product
    }));
  } catch (error) {
    console.error('Error fetching order items:', error);
    return [];
  }
}

// Send Telegram notification with full order details
async function sendTelegramNotification(order: OrderDetails, items: OrderItem[]): Promise<boolean> {
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
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true,
      timeZone: 'America/Los_Angeles'
    });

    // Format products list
    let productsText = '';
    if (items.length > 0) {
      productsText = items
        .filter(item => item.product)
        .map(item => `• ${item.quantity}x ${item.product!.name} (${item.product!.sku})`)
        .join('\n');
    }
    
    const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━';
    
    const message = `${divider}
🔔 *New Order Received!*
${divider}

👤 *Customer:* ${name}
📞 *Phone:* ${phone}
✉️ *Email:* ${email}
📍 *Address:* ${address}

📦 *Products:*
${productsText || 'No items'}

💰 *Total:* ${total}
📅 *Date:* ${date}
🕐 *Time:* ${time}

Check the orders page for full details.
${divider}`;
    
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

    const orderId = orderDetails.orderId || '';
    console.log('Processing notification for order:', orderId || 'unknown');

    // Check for duplicate
    if (!shouldProcess(orderId)) {
      return new Response(
        JSON.stringify({ 
          message: 'Duplicate notification skipped', 
          telegram: false,
          skipped: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch order items with product details
    const orderItems = orderId ? await fetchOrderItems(orderId) : [];
    console.log('Fetched order items:', orderItems.length);

    // Send Telegram notification with full details
    const telegramSent = await sendTelegramNotification(orderDetails, orderItems);
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
