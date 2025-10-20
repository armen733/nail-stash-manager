import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { customerName } = await req.json();

    console.log('Sending push notification for new order');

    // Get all push subscriptions
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('push_subscriptions')
      .select('*');

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions found');
      return new Response(
        JSON.stringify({ message: 'No subscriptions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send basic notification to all subscriptions (no encryption for now)
    const notificationPayload = JSON.stringify({
      title: '🔔 New Order Received!',
      body: customerName ? `Order from ${customerName}` : 'A new customer order has been placed',
      url: '/orders'
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const response = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'TTL': '86400',
            },
            body: notificationPayload
          });

          if (!response.ok) {
            console.error(`Failed to send to ${sub.endpoint}:`, response.status);
            if (response.status === 410) {
              await supabaseClient
                .from('push_subscriptions')
                .delete()
                .eq('id', sub.id);
            }
          }
          return response;
        } catch (error) {
          console.error('Error sending notification:', error);
          throw error;
        }
      })
    );

    console.log('Notification results:', results);

    return new Response(
      JSON.stringify({ 
        message: 'Notifications sent',
        results: results.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
