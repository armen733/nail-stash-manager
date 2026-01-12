import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const applicationId = Deno.env.get('SQUARE_APPLICATION_ID');
    const locationId = Deno.env.get('SQUARE_LOCATION_ID');
    
    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: 'Square Application ID not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine environment based on application ID prefix
    const environment = applicationId.startsWith('sandbox-') || applicationId.startsWith('sq0idp-') 
      ? 'sandbox' 
      : 'production';

    return new Response(
      JSON.stringify({ 
        applicationId,
        locationId,
        environment
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
