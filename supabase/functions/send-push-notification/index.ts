import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@nerabeauty.com';

// Base64 URL encode/decode utilities
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

// Generate random bytes
function getRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

// HKDF implementation for key derivation
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  // Extract
  const saltKey = salt.length > 0 ? salt : new Uint8Array(32);
  const extractKey = await crypto.subtle.importKey(
    'raw', 
    saltKey.buffer as ArrayBuffer, 
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['sign']
  );
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', extractKey, ikm.buffer as ArrayBuffer));
  
  // Expand
  const prkKey = await crypto.subtle.importKey(
    'raw', 
    prk.buffer as ArrayBuffer, 
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['sign']
  );
  
  const result = new Uint8Array(length);
  let prev = new Uint8Array(0);
  let offset = 0;
  let counter = 1;
  
  while (offset < length) {
    const input = new Uint8Array(prev.length + info.length + 1);
    input.set(prev);
    input.set(info, prev.length);
    input[prev.length + info.length] = counter;
    
    prev = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, input.buffer as ArrayBuffer));
    const toCopy = Math.min(prev.length, length - offset);
    result.set(prev.subarray(0, toCopy), offset);
    offset += toCopy;
    counter++;
  }
  
  return result;
}

// Create info for HKDF
function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const info = new Uint8Array(18 + typeBytes.length + 1 + 5 + 2 + clientPublicKey.length + 2 + serverPublicKey.length);
  
  let offset = 0;
  const contentEncoding = new TextEncoder().encode('Content-Encoding: ');
  info.set(contentEncoding, offset); offset += contentEncoding.length;
  info.set(typeBytes, offset); offset += typeBytes.length;
  info[offset++] = 0; // null terminator
  info.set(new TextEncoder().encode('P-256'), offset); offset += 5;
  info[offset++] = 0; info[offset++] = 65; // client key length
  info.set(clientPublicKey, offset); offset += clientPublicKey.length;
  info[offset++] = 0; info[offset++] = 65; // server key length
  info.set(serverPublicKey, offset);
  
  return info;
}

// Encrypt the payload for Web Push
async function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string
): Promise<{ encrypted: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const clientPublicKey = base64UrlDecode(p256dh);
  const clientAuth = base64UrlDecode(auth);
  
  // Generate ephemeral key pair
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  
  // Export server public key
  const serverPublicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const serverPublicKey = new Uint8Array(serverPublicKeyRaw);
  
  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKey.buffer as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  
  // Derive shared secret
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey },
    keyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);
  
  // Generate random salt
  const salt = getRandomBytes(16);
  
  // Derive PRK using auth secret
  const authInfo = new TextEncoder().encode('Content-Encoding: auth\0');
  const prk = await hkdf(clientAuth, sharedSecret, authInfo, 32);
  
  // Derive content encryption key
  const cekInfo = createInfo('aesgcm', clientPublicKey, serverPublicKey);
  const contentEncryptionKey = await hkdf(salt, prk, cekInfo, 16);
  
  // Derive nonce
  const nonceInfo = createInfo('nonce', clientPublicKey, serverPublicKey);
  const nonce = await hkdf(salt, prk, nonceInfo, 12);
  
  // Pad and encrypt payload
  const payloadBytes = new TextEncoder().encode(payload);
  const paddingLength = 2;
  const paddedPayload = new Uint8Array(paddingLength + payloadBytes.length);
  paddedPayload[0] = 0;
  paddedPayload[1] = 0;
  paddedPayload.set(payloadBytes, paddingLength);
  
  // Import encryption key
  const key = await crypto.subtle.importKey(
    'raw',
    contentEncryptionKey.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
    key,
    paddedPayload.buffer as ArrayBuffer
  );
  
  return {
    encrypted: new Uint8Array(encrypted),
    salt,
    serverPublicKey
  };
}

// Convert DER signature to raw format
function derToRaw(derSignature: Uint8Array): Uint8Array {
  const raw = new Uint8Array(64);
  
  if (derSignature[0] !== 0x30) {
    if (derSignature.length === 64) return derSignature;
    throw new Error('Invalid signature format');
  }
  
  let offset = 2;
  if (derSignature[offset] !== 0x02) throw new Error('Expected integer tag for r');
  offset++;
  const rLen = derSignature[offset]; offset++;
  let rStart = offset, rBytes = rLen;
  if (derSignature[rStart] === 0x00 && rLen > 32) { rStart++; rBytes--; }
  const rPadding = 32 - rBytes;
  if (rPadding > 0) raw.fill(0, 0, rPadding);
  raw.set(derSignature.subarray(rStart, rStart + rBytes), Math.max(0, rPadding));
  offset += rLen;
  
  if (derSignature[offset] !== 0x02) throw new Error('Expected integer tag for s');
  offset++;
  const sLen = derSignature[offset]; offset++;
  let sStart = offset, sBytes = sLen;
  if (derSignature[sStart] === 0x00 && sLen > 32) { sStart++; sBytes--; }
  const sPadding = 32 - sBytes;
  if (sPadding > 0) raw.fill(0, 32, 32 + sPadding);
  raw.set(derSignature.subarray(sStart, sStart + sBytes), 32 + Math.max(0, sPadding));
  
  return raw;
}

// Import VAPID keys
async function importVapidKeys(): Promise<CryptoKey> {
  const privateKeyBytes = base64UrlDecode(VAPID_PRIVATE_KEY);
  const publicKeyBytes = base64UrlDecode(VAPID_PUBLIC_KEY);
  
  if (privateKeyBytes.length !== 32) throw new Error(`Invalid private key length: ${privateKeyBytes.length}`);
  if (publicKeyBytes.length !== 65) throw new Error(`Invalid public key length: ${publicKeyBytes.length}`);
  
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicKeyBytes.subarray(1, 33)),
    y: base64UrlEncode(publicKeyBytes.subarray(33, 65)),
    d: base64UrlEncode(privateKeyBytes),
  };
  
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// Create VAPID authorization header
async function createVapidAuth(endpoint: string, signingKey: CryptoKey): Promise<string> {
  const urlParts = new URL(endpoint);
  const audience = `${urlParts.protocol}//${urlParts.host}`;
  
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { 
    aud: audience, 
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT 
  };
  
  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(unsignedToken)
  );
  
  const rawSignature = derToRaw(new Uint8Array(signatureBuffer));
  const jwt = `${unsignedToken}.${base64UrlEncode(rawSignature)}`;
  
  return `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Push notification function called');
    
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const signingKey = await importVapidKeys();
    console.log('VAPID keys loaded');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let customerName = 'Customer';
    try {
      const body = await req.json();
      customerName = body.customerName || 'Customer';
    } catch {}

    console.log('Processing notification for:', customerName);

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
      title: '🔔 New Order!',
      body: `Order from ${customerName}`,
      url: '/orders'
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          console.log(`Sending to endpoint: ${sub.endpoint.substring(0, 60)}...`);
          
          // Encrypt the payload
          const { encrypted, salt, serverPublicKey } = await encryptPayload(
            notificationPayload,
            sub.p256dh,
            sub.auth
          );
          
          // Create VAPID authorization
          const authHeader = await createVapidAuth(sub.endpoint, signingKey);
          
          const response = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Encoding': 'aesgcm',
              'Encryption': `salt=${base64UrlEncode(salt)}`,
              'Crypto-Key': `dh=${base64UrlEncode(serverPublicKey)}; p256ecdsa=${VAPID_PUBLIC_KEY}`,
              'TTL': '86400',
              'Authorization': authHeader,
            },
            body: encrypted.buffer as ArrayBuffer
          });

          console.log(`Response status: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed: ${response.status} - ${errorText}`);
            
            if (response.status === 410 || response.status === 404) {
              await supabaseClient.from('push_subscriptions').delete().eq('id', sub.id);
              console.log('Deleted expired subscription');
            }
            return { success: false, status: response.status, error: errorText };
          }
          
          console.log('Push sent successfully!');
          return { success: true, status: response.status };
        } catch (error) {
          console.error('Error sending push:', error);
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
