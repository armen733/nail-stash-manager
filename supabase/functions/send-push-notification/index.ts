import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

// Send Telegram notification
async function sendTelegramNotification(customerName: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram not configured, skipping');
    return false;
  }

  try {
    const message = `🔔 *New Order Received!*\n\nCustomer: ${customerName}\n\nCheck the orders page for details.`;
    
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
    
    let customerName = 'Customer';
    try {
      const body = await req.json();
      customerName = body.customerName || 'Customer';
    } catch {}

    console.log('Processing notification for:', customerName);

    // Send Telegram notification (primary - reliable)
    const telegramSent = await sendTelegramNotification(customerName);
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
