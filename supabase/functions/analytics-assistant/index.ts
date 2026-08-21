import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return j({ error: "Missing LOVABLE_API_KEY" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return j({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return j({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      question?: string;
      messages?: ChatMessage[];
      days?: number;
    };
    const question = (body.question || "").trim();
    if (!question) return j({ error: "Question is required" }, 400);
    const days = Math.min(Math.max(Number(body.days) || 90, 7), 365);

    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // ---- Gather a compact business snapshot -------------------------------
    const [ordersRes, productsRes, salonsRes, expensesRes] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_date, status, subtotal, discount_amount, tax, shipping, total, salon_id, customer_name, order_items(quantity, unit_price, line_total, product_id)"
        )
        .gte("order_date", since)
        .order("order_date", { ascending: false })
        .limit(1500),
      supabase
        .from("products")
        .select("id, name, sku, category, variant_name, bit_type, stock_on_hand, reorder_level, cost_usd, price_usd, wholesale_price_usd")
        .limit(2000),
      supabase.from("salons").select("id, name, city, is_active").limit(500),
      supabase
        .from("business_expenses")
        .select("category, amount, expense_date")
        .gte("expense_date", since)
        .limit(500),
    ]);

    const orders = ordersRes.data || [];
    const products = productsRes.data || [];
    const salons = salonsRes.data || [];
    const expenses = expensesRes.data || [];

    const productById = new Map(products.map((p: any) => [p.id, p]));
    const salonById = new Map(salons.map((s: any) => [s.id, s]));

    // Product performance
    const perProduct = new Map<string, { name: string; sku: string; cat: string; variant: string | null; units: number; revenue: number; profit: number; stock: number; reserved: number; reorder: number; cost: number; price: number }>();
    // Buyer performance
    const perBuyer = new Map<string, { name: string; orders: number; revenue: number; items: Map<string, number> }>();

    for (const o of orders as any[]) {
      const buyerName = salonById.get(o.salon_id)?.name || o.customer_name || "Walk-in / Online";
      const buyerKey = o.salon_id || `name:${buyerName}`;
      if (!perBuyer.has(buyerKey))
        perBuyer.set(buyerKey, { name: buyerName, orders: 0, revenue: 0, items: new Map() });
      const buyer = perBuyer.get(buyerKey)!;
      buyer.orders += 1;
      buyer.revenue += Number(o.total || 0);

      for (const it of o.order_items || []) {
        const p: any = productById.get(it.product_id);
        const key = it.product_id;
        const cost = Number(p?.cost_usd || 0);
        if (!perProduct.has(key))
          perProduct.set(key, {
            name: p?.name || "Unknown",
            sku: p?.sku || "—",
            cat: p?.category || "—",
            variant: p?.variant_name || p?.bit_type || null,
            units: 0,
            revenue: 0,
            profit: 0,
            stock: Number(p?.stock_on_hand || 0),
            reserved: 0,
            reorder: Number(p?.reorder_level || 0),
            cost: cost,
            price: Number(p?.price_usd || 0),
          });
        const agg = perProduct.get(key)!;
        agg.units += Number(it.quantity || 0);
        agg.revenue += Number(it.line_total || 0);
        agg.profit += (Number(it.unit_price || 0) - cost) * Number(it.quantity || 0);

        const label = p?.name || "Unknown";
        buyer.items.set(label, (buyer.items.get(label) || 0) + Number(it.quantity || 0));
      }
    }

    const topProducts = [...perProduct.values()]
      .sort((a, b) => b.units - a.units)
      .slice(0, 40)
      .map((p) => ({ ...p, revenue: +p.revenue.toFixed(2), profit: +p.profit.toFixed(2) }));

    const worstProducts = [...perProduct.values()]
      .sort((a, b) => a.units - b.units)
      .slice(0, 15)
      .map((p) => ({ name: p.name, sku: p.sku, units: p.units, revenue: +p.revenue.toFixed(2) }));

    const topBuyers = [...perBuyer.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 25)
      .map((b) => ({
        name: b.name,
        orders: b.orders,
        revenue: +b.revenue.toFixed(2),
        favorites: [...b.items.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([n, q]) => `${n} x${q}`),
      }));

    const neverSold = products
      .filter((p: any) => !perProduct.has(p.id) && Number(p.stock_on_hand || 0) > 0)
      .slice(0, 25)
      .map((p: any) => ({ name: p.name, sku: p.sku, stock: p.stock_on_hand }));

    const lowStock = products
      .filter((p: any) => Number(p.stock_on_hand || 0) <= Number(p.reorder_level || 0))
      .sort((a: any, b: any) => Number(a.stock_on_hand || 0) - Number(b.stock_on_hand || 0))
      .slice(0, 40)
      .map((p: any) => ({
        name: p.name,
        sku: p.sku,
        stock: p.stock_on_hand,
        reorder: p.reorder_level,
        sold: perProduct.get(p.id)?.units ?? 0,
      }));

    const revenue = orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const discounts = orders.reduce((s: number, o: any) => s + Number(o.discount_amount || 0), 0);
    const grossProfit = [...perProduct.values()].reduce((s, p) => s + p.profit, 0);
    const expenseTotal = expenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const expenseByCategory = Object.entries(
      expenses.reduce((acc: Record<string, number>, e: any) => {
        acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0);
        return acc;
      }, {})
    ).map(([category, amount]) => ({ category, amount: +Number(amount).toFixed(2) }));

    // Monthly revenue trend
    const byMonth = new Map<string, number>();
    for (const o of orders as any[]) {
      const m = String(o.order_date).slice(0, 7);
      byMonth.set(m, (byMonth.get(m) || 0) + Number(o.total || 0));
    }
    const monthly = [...byMonth.entries()]
      .sort()
      .map(([month, total]) => ({ month, revenue: +total.toFixed(2) }));

    // ---- Day-level and week-level breakdowns (so specific-day questions work) ----
    const isoWeek = (dateStr: string) => {
      const d = new Date(dateStr + "T00:00:00Z");
      const day = (d.getUTCDay() + 6) % 7; // Monday = 0
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - day);
      return monday.toISOString().slice(0, 10); // week starting Monday
    };

    const byDay = new Map<string, { date: string; orders: number; revenue: number; units: number; profit: number; skus: Map<string, { sku: string; name: string; units: number; revenue: number }> }>();
    const byWeek = new Map<string, { weekStart: string; orders: number; revenue: number; units: number }>();

    for (const o of orders as any[]) {
      const date = String(o.order_date).slice(0, 10);
      if (!byDay.has(date)) byDay.set(date, { date, orders: 0, revenue: 0, units: 0, profit: 0, skus: new Map() });
      const d = byDay.get(date)!;
      d.orders += 1;
      d.revenue += Number(o.total || 0);

      const wk = isoWeek(date);
      if (!byWeek.has(wk)) byWeek.set(wk, { weekStart: wk, orders: 0, revenue: 0, units: 0 });
      const w = byWeek.get(wk)!;
      w.orders += 1;
      w.revenue += Number(o.total || 0);

      for (const it of o.order_items || []) {
        const p: any = productById.get(it.product_id);
        const q = Number(it.quantity || 0);
        const rev = Number(it.line_total || 0);
        d.units += q;
        w.units += q;
        d.profit += (Number(it.unit_price || 0) - Number(p?.cost_usd || 0)) * q;
        const sku = p?.sku || "—";
        if (!d.skus.has(sku)) d.skus.set(sku, { sku, name: p?.name || "Unknown", units: 0, revenue: 0 });
        const s = d.skus.get(sku)!;
        s.units += q;
        s.revenue += rev;
      }
    }

    const dailySorted = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    // Compact daily revenue for the whole period
    const dailyRevenue = dailySorted.map((d) => ({
      date: d.date,
      orders: d.orders,
      units: d.units,
      revenue: +d.revenue.toFixed(2),
      profit: +d.profit.toFixed(2),
    }));
    // Full SKU detail for the most recent 21 days with activity (covers "last day", "yesterday", "this week")
    const dailySkuDetail = dailySorted.slice(0, 21).map((d) => ({
      date: d.date,
      orders: d.orders,
      revenue: +d.revenue.toFixed(2),
      profit: +d.profit.toFixed(2),
      skus: [...d.skus.values()]
        .sort((a, b) => b.units - a.units)
        .slice(0, 25)
        .map((s) => ({ sku: s.sku, name: s.name, units: s.units, revenue: +s.revenue.toFixed(2) })),
    }));
    const weeklyRevenue = [...byWeek.values()]
      .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))
      .slice(0, 30)
      .map((w) => ({ weekStart: w.weekStart, orders: w.orders, units: w.units, revenue: +w.revenue.toFixed(2) }));

    const snapshot = {
      period: { days, since, today: new Date().toISOString().slice(0, 10) },
      totals: {
        orders: orders.length,
        revenue: +revenue.toFixed(2),
        discounts: +discounts.toFixed(2),
        grossProfit: +grossProfit.toFixed(2),
        expenses: +expenseTotal.toFixed(2),
        netProfit: +(grossProfit - expenseTotal).toFixed(2),
        activeSalons: salons.filter((s: any) => s.is_active !== false).length,
        skuCount: products.length,
      },
      monthlyRevenue: monthly,
      weeklyRevenue,
      dailyRevenue,
      dailySkuDetail,
      lastActiveDay: dailySkuDetail[0]?.date || null,
      topProducts,
      worstProducts,
      neverSoldButInStock: neverSold,
      topBuyers,
      lowStock,
      expenseByCategory,
    };


    const systemPrompt = `You are the business analyst assistant for NÉRA Beauty, a nail-supply wholesale business.
You answer the owner's questions using ONLY the JSON business snapshot provided. Today's date is ${snapshot.period.today}; the snapshot covers the last ${days} days.

Rules:
- Be concise and concrete. Use real names, SKUs, units and dollar amounts from the data.
- Use short markdown: a one-line answer, then bullet points or a small table when listing items.
- Money as $1,234.56. Never invent products, salons or numbers that are not in the data.
- Day/week questions ARE answerable: "dailyRevenue" has per-day orders/units/revenue/profit for the whole period, "dailySkuDetail" has per-SKU units and revenue for the most recent 21 active days, "weeklyRevenue" has Monday-start weekly totals, and "lastActiveDay" is the most recent day with sales. Use these for "last day", "yesterday", "today", "this week", "last week", or any specific date.
- If a requested date has no entry in dailyRevenue, that means there were no sales that day — say that plainly instead of saying data is unavailable.
- Only say data is missing when the requested range is truly outside the ${days}-day window.
- When asked for recommendations, give 3-5 prioritized, actionable steps (restock, push, discontinue, upsell a specific salon).
- Keep answers under ~250 words unless a longer list is explicitly requested.
- The messages before the current question are the earlier conversation in this same ${days}-day period. Treat them as context: resolve follow-ups like "that salon", "those bits", "and last month?", "why?" against what was already discussed, and do not ask the owner to repeat information already given.
- Do not repeat a full list you already gave; answer only the new part of the follow-up.`;

    const history = (body.messages || []).slice(-16).map((m) => ({
      role: m.role,
      content: String(m.content || "").slice(0, 4000),
    }));

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: `BUSINESS SNAPSHOT JSON:\n${JSON.stringify(snapshot)}` },
          ...history,
          { role: "user", content: question },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const status = resp.status === 429 || resp.status === 402 ? resp.status : 500;
      return j({ error: `AI error ${resp.status}: ${text}` }, status);
    }

    const data = await resp.json();
    const answer = data.choices?.[0]?.message?.content ?? "No answer generated.";

    return j({ answer, stats: snapshot.totals });
  } catch (e: any) {
    return j({ error: e?.message || "Unexpected error" }, 500);
  }
});
