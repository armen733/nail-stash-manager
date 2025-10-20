import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushSubscription {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { title, body, url } = await req.json();

    // Get all subscriptions
    const { data: subscriptions, error } = await supabaseClient
      .from('push_subscriptions')
      .select('*');

    if (error) throw error;

    const vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib37J8-fAgTkxJSNfQtHSfJhHIj41SVh5Hk4_Xh5aK9HYyTkBdtRBl1L9kc';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!vapidPrivateKey) {
      throw new Error('VAPID_PRIVATE_KEY not set');
    }

    const payload = JSON.stringify({ title, body, url });

    // Send to all subscriptions
    const promises = (subscriptions as PushSubscription[]).map(async (sub) => {
      try {
        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'TTL': '86400',
          },
          body: payload,
        });

        if (!response.ok) {
          console.error(`Failed to send to ${sub.endpoint}:`, await response.text());
        }
      } catch (err) {
        console.error('Error sending push:', err);
      }
    });

    await Promise.all(promises);

    return new Response(
      JSON.stringify({ success: true, sent: subscriptions?.length || 0 }),
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
