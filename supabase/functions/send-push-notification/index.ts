import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? 'BKxN9L3vJ8K2mF5nP6qR1sT7uV9wX0yZ2aB4cD6eF8gH0iJ2kL4mN6oP8qR0sT2uV4wX6yZ8aB0cD2eF4gH6i';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@nerabeauty.com';

// Base64 URL encode
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Import private key for signing
async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  try {
    // Remove base64url encoding and convert to raw bytes
    const padding = '='.repeat((4 - (privateKeyBase64.length % 4)) % 4);
    const base64 = (privateKeyBase64 + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const rawKey = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    
    return await crypto.subtle.importKey(
      'pkcs8',
      rawKey,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['sign']
    );
  } catch (error) {
    console.error('Error importing private key:', error);
    throw error;
  }
}

// Create VAPID JWT token
async function createVapidToken(endpoint: string): Promise<string> {
  if (!VAPID_PRIVATE_KEY) {
    console.warn('VAPID_PRIVATE_KEY not set, using public key only');
    return `vapid t=${VAPID_PUBLIC_KEY}, k=${VAPID_PUBLIC_KEY}`;
  }

  try {
    const urlParts = new URL(endpoint);
    const audience = `${urlParts.protocol}//${urlParts.host}`;
    
    const header = {
      typ: 'JWT',
      alg: 'ES256'
    };
    
    const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours
    const payload = {
      aud: audience,
      exp: exp,
      sub: VAPID_SUBJECT
    };
    
    // Encode header and payload
    const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    
    // Sign the token
    const privateKey = await importPrivateKey(VAPID_PRIVATE_KEY);
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(unsignedToken)
    );
    
    const encodedSignature = base64UrlEncode(new Uint8Array(signature));
    const jwt = `${unsignedToken}.${encodedSignature}`;
    
    return `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`;
  } catch (error) {
    console.error('Error creating VAPID token:', error);
    // Fallback to simple header
    return `vapid t=${VAPID_PUBLIC_KEY}, k=${VAPID_PUBLIC_KEY}`;
  }
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
          const authHeader = await createVapidToken(sub.endpoint);
          
          const response = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'TTL': '86400',
              'Authorization': authHeader,
            },
            body: notificationPayload
          });

          if (!response.ok) {
            console.error(`Failed to send to ${sub.endpoint}:`, response.status, await response.text());
            if (response.status === 410 || response.status === 404) {
              // Subscription expired or no longer valid
              await supabaseClient
                .from('push_subscriptions')
                .delete()
                .eq('id', sub.id);
              console.log(`Deleted expired subscription ${sub.id}`);
            }
          } else {
            console.log(`Successfully sent notification to ${sub.endpoint}`);
          }
          return response;
        } catch (error) {
          console.error('Error sending notification:', error);
          throw error;
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`Notification results: ${successful}/${results.length} successful`);

    return new Response(
      JSON.stringify({ 
        message: 'Notifications sent',
        total: results.length,
        successful
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
