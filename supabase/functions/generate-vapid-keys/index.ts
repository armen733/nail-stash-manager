import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base64 URL encoding
function base64UrlEncode(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Generating new VAPID key pair...');

    // Generate a new ECDSA P-256 key pair
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true, // extractable
      ['sign', 'verify']
    );

    // Export the public key in raw format (65 bytes uncompressed)
    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const publicKeyBase64 = base64UrlEncode(publicKeyRaw);

    // Export the private key in JWK format to get the 'd' parameter
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const privateKeyBase64 = privateKeyJwk.d!;

    console.log('VAPID keys generated successfully');
    console.log('Public key length:', publicKeyBase64.length);
    console.log('Private key length:', privateKeyBase64.length);

    return new Response(
      JSON.stringify({
        success: true,
        publicKey: publicKeyBase64,
        privateKey: privateKeyBase64,
        instructions: [
          "Copy these keys and update the secrets:",
          "1. VAPID_PUBLIC_KEY = " + publicKeyBase64,
          "2. VAPID_PRIVATE_KEY = " + privateKeyBase64,
          "3. Then clear push_subscriptions table and re-subscribe"
        ]
      }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating VAPID keys:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
