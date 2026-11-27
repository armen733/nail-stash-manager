import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildMetaProductFeed, type MetaFeedProduct } from "./feed.ts";

const PAGE_SIZE = 1000;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment is not configured");
    }

    // The public catalog role already reads these fields for signed-out shoppers.
    // No customer, order, profile, or manager-only data is selected or exposed.
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const products: MetaFeedProduct[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id, name, sku, description, price_usd, category, image_url,
          stock_on_hand, stock_reserved, sibling_group_id,
          product_images(image_url, display_order)
        `)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      const page = (data ?? []) as unknown as MetaFeedProduct[];
      products.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const feed = buildMetaProductFeed(products);
    console.log(`[META-PRODUCT-FEED] items=${feed.itemCount} skipped_missing_images=${feed.skippedMissingImages}`);

    return new Response(req.method === "HEAD" ? null : feed.csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'inline; filename="nera-meta-products.csv"',
        "Cache-Control": "public, max-age=0, s-maxage=900",
        "X-Feed-Items": String(feed.itemCount),
      },
    });
  } catch (error) {
    console.error("[META-PRODUCT-FEED] Failed", error instanceof Error ? error.message : error);
    return new Response("Unable to generate the product feed right now.", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
