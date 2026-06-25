import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SkuRow {
  sku: string;
  name: string;
  category: string;
  variant: string | null;
  units_sold: number;
  revenue: number;
  stock: number;
  reorder_level: number;
  velocity_per_day: number;
  days_of_stock: number | null;
  badges: string[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { skus, periodDays, categoryLabel } = (await req.json()) as {
      skus: SkuRow[];
      periodDays: number;
      categoryLabel: string;
    };

    if (!skus || skus.length === 0) {
      return new Response(JSON.stringify({ error: "No SKUs provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Keep payload compact — top 80 by units, plus all bad performers
    const compact = skus.slice(0, 80).map((s) => ({
      sku: s.sku,
      name: s.name,
      cat: s.category,
      var: s.variant,
      sold: s.units_sold,
      rev: Math.round(s.revenue),
      stock: s.stock,
      reorder: s.reorder_level,
      vel: Number(s.velocity_per_day.toFixed(2)),
      dos: s.days_of_stock,
      flags: s.badges,
    }));

    const systemPrompt = `You are a production-planning analyst for a nail-supply business. Given SKU sales data over a period, produce a concise, actionable production plan for the next stock cycle (assume ~30 day cycle). Return STRICT JSON only, no prose.

JSON shape:
{
  "summary": "2-3 sentence executive summary",
  "produce": [{"sku":"...", "name":"...", "qty": 0, "reason":"short"}],
  "discontinue": [{"sku":"...", "name":"...", "reason":"short"}],
  "trends": ["bullet 1","bullet 2"]
}

Rules:
- Suggest production qty ~ ceil(velocity_per_day * 30) minus current stock, with a sensible minimum batch (round to nearest 10 for >50, nearest 5 otherwise). Never suggest 0.
- Put fast movers and low-stock items in "produce" (max 25).
- Put items with zero/near-zero sales AND non-trivial stock in "discontinue" (max 15).
- Trends: note variant or category patterns you observe.`;

    const userPrompt = `Period: last ${periodDays} days. Scope: ${categoryLabel}.
SKU data (JSON):
${JSON.stringify(compact)}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const status = resp.status === 429 || resp.status === 402 ? resp.status : 500;
      return new Response(
        JSON.stringify({ error: `AI gateway error ${resp.status}: ${text}` }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: content, produce: [], discontinue: [], trends: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
