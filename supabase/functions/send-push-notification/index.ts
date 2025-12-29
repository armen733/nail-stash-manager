import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@nerabeauty.com';

// Base64 URL encode
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Base64 URL decode
function base64UrlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Import VAPID keys and create signing key
async function importVapidKeys(): Promise<CryptoKey> {
  const privateKeyBytes = base64UrlDecode(VAPID_PRIVATE_KEY);
  const publicKeyBytes = base64UrlDecode(VAPID_PUBLIC_KEY);
  
  console.log('Private key length:', privateKeyBytes.length);
  console.log('Public key length:', publicKeyBytes.length);
  
  if (privateKeyBytes.length !== 32) {
    throw new Error(`Invalid private key length: ${privateKeyBytes.length}, expected 32`);
  }
  
  if (publicKeyBytes.length !== 65) {
    throw new Error(`Invalid public key length: ${publicKeyBytes.length}, expected 65`);
  }
  
  // Build JWK from raw keys
  // Public key is 65 bytes: 0x04 || x (32 bytes) || y (32 bytes)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicKeyBytes.subarray(1, 33)),
    y: base64UrlEncode(publicKeyBytes.subarray(33, 65)),
    d: base64UrlEncode(privateKeyBytes),
  };
  
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

// Create VAPID JWT token
async function createVapidToken(endpoint: string, privateKey: CryptoKey): Promise<string> {
  const urlParts = new URL(endpoint);
  const audience = `${urlParts.protocol}//${urlParts.host}`;
  
  const header = { typ: 'JWT', alg: 'ES256' };
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours
  const payload = { aud: audience, exp: exp, sub: VAPID_SUBJECT };
  
  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );
  
  const signature = new Uint8Array(signatureBuffer);
  const encodedSignature = base64UrlEncode(signature);
  const jwt = `${unsignedToken}.${encodedSignature}`;
  
  return `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Push notification function called');
    
    // Validate VAPID keys upfront
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Import keys once
    let signingKey: CryptoKey;
    try {
      signingKey = await importVapidKeys();
      console.log('VAPID keys imported successfully');
    } catch (keyError) {
      console.error('Failed to import VAPID keys:', keyError);
      return new Response(
        JSON.stringify({ error: 'Invalid VAPID keys: ' + String(keyError) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let customerName = 'Customer';
    try {
      const body = await req.json();
      customerName = body.customerName || 'Customer';
    } catch {
      // Body might be empty
    }

    console.log('Sending push notification for customer:', customerName);

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

    console.log(`Found ${subscriptions.length} subscriptions`);

    const notificationPayload = JSON.stringify({
      title: '🔔 New Order Received!',
      body: `Order from ${customerName}`,
      url: '/orders'
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          console.log(`Sending to: ${sub.endpoint.substring(0, 50)}...`);
          
          const authHeader = await createVapidToken(sub.endpoint, signingKey);
          
          const response = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'TTL': '86400',
              'Authorization': authHeader,
            },
            body: notificationPayload
          });

          console.log(`Response: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed: ${response.status} ${errorText}`);
            
            if (response.status === 410 || response.status === 404) {
              await supabaseClient.from('push_subscriptions').delete().eq('id', sub.id);
              console.log(`Deleted expired subscription`);
            }
            return { success: false, status: response.status, error: errorText };
          }
          
          console.log(`Success!`);
          return { success: true, status: response.status };
        } catch (error) {
          console.error('Error:', error);
          return { success: false, error: String(error) };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    console.log(`Results: ${successful}/${results.length} successful`);

    return new Response(
      JSON.stringify({ message: 'Notifications processed', total: results.length, successful }),
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
