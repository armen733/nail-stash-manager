import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';

// Helper function to convert base64url to base64
function base64UrlToBase64(base64url: string): string {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return base64;
}

// Helper to create VAPID auth headers
function createVapidAuthHeader(endpoint: string): string {
  const urlParts = new URL(endpoint);
  const audience = `${urlParts.protocol}//${urlParts.host}`;
  
  const vapidHeaders = {
    typ: 'JWT',
    alg: 'ES256'
  };
  
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours
  
  const vapidClaims = {
    aud: audience,
    exp: exp,
    sub: 'mailto:your-email@example.com'
  };
  
  // For now, return a simple header - in production you'd need proper JWT signing
  return `vapid t=${VAPID_PUBLIC_KEY}, k=${VAPID_PRIVATE_KEY}`;
}

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

    // Send notification to all subscriptions
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
              'Authorization': createVapidAuthHeader(sub.endpoint),
            },
            body: notificationPayload
          });

          if (!response.ok) {
            console.error(`Failed to send to ${sub.endpoint}:`, response.status, await response.text());
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