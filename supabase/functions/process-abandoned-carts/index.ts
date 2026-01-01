import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Processing abandoned carts...");
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find carts that are:
    // - Older than 24 hours
    // - Haven't been sent an email yet
    // - Haven't been converted to orders
    // - Have items
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: abandonedCarts, error: fetchError } = await supabase
      .from("abandoned_carts")
      .select("*")
      .lt("updated_at", twentyFourHoursAgo)
      .is("email_sent_at", null)
      .is("converted_at", null)
      .not("email", "is", null);

    if (fetchError) {
      console.error("Error fetching abandoned carts:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${abandonedCarts?.length || 0} abandoned carts to process`);

    if (!abandonedCarts || abandonedCarts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No abandoned carts to process", processed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const cart of abandonedCarts) {
      try {
        // Parse items from JSONB
        const items = cart.items as Array<{
          name: string;
          quantity: number;
          price: number;
          image_url?: string;
        }>;

        if (!items || items.length === 0) {
          console.log(`Skipping cart ${cart.id} - no items`);
          continue;
        }

        console.log(`Sending abandoned cart email to ${cart.email} for cart ${cart.id}`);

        // Call the transactional email function
        const emailResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            type: "abandoned_cart",
            email: cart.email,
            name: cart.name || "there",
            cartItems: items,
            cartTotal: cart.total,
            cartUrl: "https://nerabeautyus.com/products",
          }),
        });

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json();
          console.error(`Failed to send email for cart ${cart.id}:`, errorData);
          errors++;
          continue;
        }

        // Mark cart as email sent
        const { error: updateError } = await supabase
          .from("abandoned_carts")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("id", cart.id);

        if (updateError) {
          console.error(`Failed to update cart ${cart.id}:`, updateError);
          errors++;
          continue;
        }

        console.log(`Successfully processed cart ${cart.id}`);
        processed++;
      } catch (cartError) {
        console.error(`Error processing cart ${cart.id}:`, cartError);
        errors++;
      }
    }

    console.log(`Finished processing. Processed: ${processed}, Errors: ${errors}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processed} abandoned carts`,
        processed,
        errors,
        total: abandonedCarts.length 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in process-abandoned-carts:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
