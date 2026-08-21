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

const r2 = (n: number) => +Number(n || 0).toFixed(2);

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

    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    // Same-length previous window, for period-over-period comparisons
    const prevSince = new Date(Date.now() - days * 2 * 86400000).toISOString().slice(0, 10);

    // ---- Gather a rich business snapshot ---------------------------------
    const [
      ordersRes,
      prevOrdersRes,
      productsRes,
      salonsRes,
      expensesRes,
      returnsRes,
      paymentsRes,
      productionRes,
      referralRes,
      profilesRes,
    ] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, invoice_number, order_date, status, subtotal, discount_amount, discount_code, tax, shipping, total, amount_paid, balance_due, salon_id, profile_id, customer_name, customer_email, technician_name, points_earned, points_redeemed, order_items(quantity, unit_price, line_total, product_id)"
        )
        .gte("order_date", since)
        .order("order_date", { ascending: false })
        .limit(3000),
      supabase
        .from("orders")
        .select("order_date, total, tax, salon_id, subtotal, discount_amount")
        .gte("order_date", prevSince)
        .lt("order_date", since)
        .limit(3000),
      supabase
        .from("products")
        .select(
          "id, name, sku, category, variant_name, bit_type, grit, material, shape, stock_on_hand, stock_reserved, reorder_level, cost_usd, price_usd, salon_price_usd, wholesale_price_usd, supplier"
        )
        .limit(3000),
      supabase.from("salons").select("id, name, city, is_active, created_at").limit(1000),
      supabase
        .from("business_expenses")
        .select("category, description, amount, expense_date, is_recurring")
        .gte("expense_date", since)
        .limit(1000),
      supabase
        .from("returns")
        .select("id, created_at, refund_amount, refund_method, reason, order_id")
        .gte("created_at", since)
        .limit(500),
      supabase
        .from("payments")
        .select("amount, method, paid_at, order_id, salon_id")
        .gte("paid_at", since)
        .limit(2000),
      supabase
        .from("production_orders")
        .select("product_name, sku, supplier_name, quantity, amount_spent, order_date")
        .gte("order_date", since)
        .limit(500),
      supabase
        .from("referral_commissions")
        .select("commission_amount, order_subtotal, status, created_at, referrer_id")
        .gte("created_at", since)
        .limit(1000),
      supabase.from("profiles").select("id, full_name, email, loyalty_points").limit(2000),
    ]);

    const orders = ordersRes.data || [];
    const prevOrders = prevOrdersRes.data || [];
    const products = productsRes.data || [];
    const salons = salonsRes.data || [];
    const expenses = expensesRes.data || [];
    const returns = returnsRes.data || [];
    const payments = paymentsRes.data || [];
    const production = productionRes.data || [];
    const commissions = referralRes.data || [];
    const profiles = profilesRes.data || [];

    const productById = new Map(products.map((p: any) => [p.id, p]));
    const salonById = new Map(salons.map((s: any) => [s.id, s]));
    const profileById = new Map(profiles.map((p: any) => [p.id, p]));

    type ProdAgg = {
      name: string;
      sku: string;
      cat: string;
      variant: string | null;
      units: number;
      revenue: number;
      profit: number;
      stock: number;
      reorder: number;
      cost: number;
      price: number;
      buyers: Set<string>;
      lastSold: string | null;
    };
    const perProduct = new Map<string, ProdAgg>();
    type BuyerAgg = {
      name: string;
      type: "salon" | "website" | "walk-in";
      city: string | null;
      orders: number;
      revenue: number;
      profit: number;
      balanceDue: number;
      firstOrder: string;
      lastOrder: string;
      items: Map<string, number>;
    };
    const perBuyer = new Map<string, BuyerAgg>();
    const perCategory = new Map<string, { category: string; units: number; revenue: number; profit: number; skus: Set<string> }>();
    const perVariant = new Map<string, { label: string; category: string; units: number; revenue: number; profit: number }>();
    const statusCount = new Map<string, { status: string; orders: number; revenue: number }>();

    let websiteRevenue = 0;
    let websiteOrders = 0;
    let inPersonRevenue = 0;
    let inPersonOrders = 0;
    let balanceDueTotal = 0;
    let shippingTotal = 0;
    let taxTotal = 0;

    for (const o of orders as any[]) {
      const date = String(o.order_date).slice(0, 10);
      const isSalon = !!o.salon_id;
      const salon = salonById.get(o.salon_id);
      const buyerName = salon?.name || o.customer_name || "Walk-in / Online";
      const buyerKey = o.salon_id || o.profile_id || `name:${buyerName}`;
      const buyerType: BuyerAgg["type"] = isSalon ? "salon" : o.profile_id ? "website" : "walk-in";

      if (!perBuyer.has(buyerKey))
        perBuyer.set(buyerKey, {
          name: buyerName,
          type: buyerType,
          city: salon?.city || null,
          orders: 0,
          revenue: 0,
          profit: 0,
          balanceDue: 0,
          firstOrder: date,
          lastOrder: date,
          items: new Map(),
        });
      const buyer = perBuyer.get(buyerKey)!;
      buyer.orders += 1;
      buyer.revenue += Number(o.total || 0);
      buyer.balanceDue += Number(o.balance_due || 0);
      if (date > buyer.lastOrder) buyer.lastOrder = date;
      if (date < buyer.firstOrder) buyer.firstOrder = date;

      if (isSalon) {
        inPersonRevenue += Number(o.total || 0);
        inPersonOrders += 1;
      } else {
        websiteRevenue += Number(o.total || 0);
        websiteOrders += 1;
      }
      balanceDueTotal += Number(o.balance_due || 0);
      shippingTotal += Number(o.shipping || 0);
      taxTotal += Number(o.tax || 0);

      const st = String(o.status || "Unknown");
      if (!statusCount.has(st)) statusCount.set(st, { status: st, orders: 0, revenue: 0 });
      const stAgg = statusCount.get(st)!;
      stAgg.orders += 1;
      stAgg.revenue += Number(o.total || 0);

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
            reorder: Number(p?.reorder_level || 0),
            cost,
            price: Number(p?.price_usd || 0),
            buyers: new Set(),
            lastSold: null,
          });
        const agg = perProduct.get(key)!;
        const q = Number(it.quantity || 0);
        const rev = Number(it.line_total || 0);
        const prof = (Number(it.unit_price || 0) - cost) * q;
        agg.units += q;
        agg.revenue += rev;
        agg.profit += prof;
        agg.buyers.add(buyerKey);
        if (!agg.lastSold || date > agg.lastSold) agg.lastSold = date;
        buyer.profit += prof;

        const catKey = p?.category || "—";
        if (!perCategory.has(catKey))
          perCategory.set(catKey, { category: catKey, units: 0, revenue: 0, profit: 0, skus: new Set() });
        const c = perCategory.get(catKey)!;
        c.units += q;
        c.revenue += rev;
        c.profit += prof;
        c.skus.add(agg.sku);

        const vLabel = `${catKey} / ${p?.variant_name || p?.bit_type || "—"}`;
        if (!perVariant.has(vLabel))
          perVariant.set(vLabel, { label: vLabel, category: catKey, units: 0, revenue: 0, profit: 0 });
        const v = perVariant.get(vLabel)!;
        v.units += q;
        v.revenue += rev;
        v.profit += prof;

        const label = p?.name || "Unknown";
        buyer.items.set(label, (buyer.items.get(label) || 0) + q);
      }
    }

    const daysSince = (d: string) =>
      Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(d + "T00:00:00Z")) / 86400000);

    const productList = [...perProduct.values()].map((p) => ({
      sku: p.sku,
      name: p.name,
      category: p.cat,
      variant: p.variant,
      units: p.units,
      revenue: r2(p.revenue),
      profit: r2(p.profit),
      marginPercent: p.revenue > 0 ? +((p.profit / p.revenue) * 100).toFixed(1) : 0,
      cost: p.cost,
      price: p.price,
      stockLeft: p.stock,
      reorder: p.reorder,
      needsReorder: p.stock <= p.reorder,
      distinctBuyers: p.buyers.size,
      lastSold: p.lastSold,
      daysSinceLastSale: p.lastSold ? daysSince(p.lastSold) : null,
    }));

    const topProducts = [...productList].sort((a, b) => b.units - a.units).slice(0, 50);
    const topByProfit = [...productList].sort((a, b) => b.profit - a.profit).slice(0, 20);
    const bestMargins = [...productList]
      .filter((p) => p.units >= 2 && p.cost > 0)
      .sort((a, b) => b.marginPercent - a.marginPercent)
      .slice(0, 20);
    const worstMargins = [...productList]
      .filter((p) => p.units >= 2 && p.cost > 0)
      .sort((a, b) => a.marginPercent - b.marginPercent)
      .slice(0, 20);
    const worstProducts = [...productList].sort((a, b) => a.units - b.units).slice(0, 20);
    const missingCost = productList.filter((p) => !p.cost).map((p) => p.sku).slice(0, 60);

    const buyerList = [...perBuyer.values()].map((b) => ({
      name: b.name,
      type: b.type,
      city: b.city,
      orders: b.orders,
      revenue: r2(b.revenue),
      profit: r2(b.profit),
      avgOrderValue: b.orders ? r2(b.revenue / b.orders) : 0,
      balanceDue: r2(b.balanceDue),
      firstOrder: b.firstOrder,
      lastOrder: b.lastOrder,
      daysSinceLastOrder: daysSince(b.lastOrder),
      favorites: [...b.items.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([n, q]) => `${n} x${q}`),
    }));
    const topBuyers = [...buyerList].sort((a, b) => b.revenue - a.revenue).slice(0, 40);
    const atRiskBuyers = [...buyerList]
      .filter((b) => b.daysSinceLastOrder >= 21 && b.orders >= 2)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 25);
    const openBalances = [...buyerList]
      .filter((b) => b.balanceDue > 0.01)
      .sort((a, b) => b.balanceDue - a.balanceDue)
      .slice(0, 25);

    const neverSold = products
      .filter((p: any) => !perProduct.has(p.id) && Number(p.stock_on_hand || 0) > 0)
      .sort((a: any, b: any) => Number(b.stock_on_hand || 0) - Number(a.stock_on_hand || 0))
      .slice(0, 40)
      .map((p: any) => ({
        sku: p.sku,
        name: p.name,
        stock: Number(p.stock_on_hand || 0),
        tiedUpCost: r2(Number(p.stock_on_hand || 0) * Number(p.cost_usd || 0)),
      }));

    const lowStock = products
      .filter((p: any) => Number(p.stock_on_hand || 0) <= Number(p.reorder_level || 0))
      .sort((a: any, b: any) => Number(a.stock_on_hand || 0) - Number(b.stock_on_hand || 0))
      .slice(0, 60)
      .map((p: any) => ({
        sku: p.sku,
        name: p.name,
        stock: Number(p.stock_on_hand || 0),
        reorder: Number(p.reorder_level || 0),
        sold: perProduct.get(p.id)?.units ?? 0,
        dailyRun: +(((perProduct.get(p.id)?.units ?? 0) / days) || 0).toFixed(3),
        daysOfCoverLeft:
          (perProduct.get(p.id)?.units ?? 0) > 0
            ? Math.round((Number(p.stock_on_hand || 0) / ((perProduct.get(p.id)!.units || 1) / days)) || 0)
            : null,
      }));

    const stockBySku = products.map((p: any) => ({
      sku: p.sku,
      name: p.name,
      category: p.category,
      stock: Number(p.stock_on_hand || 0),
      reserved: Number(p.stock_reserved || 0),
      reorder: Number(p.reorder_level || 0),
      cost: Number(p.cost_usd || 0),
      price: Number(p.price_usd || 0),
      sold: perProduct.get(p.id)?.units ?? 0,
    }));
    const inventoryValueAtCost = r2(
      products.reduce((s: number, p: any) => s + Number(p.stock_on_hand || 0) * Number(p.cost_usd || 0), 0)
    );
    const inventoryValueAtRetail = r2(
      products.reduce((s: number, p: any) => s + Number(p.stock_on_hand || 0) * Number(p.price_usd || 0), 0)
    );

    const revenue = orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const discounts = orders.reduce((s: number, o: any) => s + Number(o.discount_amount || 0), 0);
    const grossProfit = [...perProduct.values()].reduce((s, p) => s + p.profit, 0);
    const expenseTotal = expenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const refundTotal = returns.reduce((s: number, r: any) => s + Number(r.refund_amount || 0), 0);
    const commissionTotal = commissions.reduce((s: number, c: any) => s + Number(c.commission_amount || 0), 0);
    const productionSpend = production.reduce((s: number, p: any) => s + Number(p.amount_spent || 0), 0);
    const collected = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

    const prevRevenue = prevOrders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);

    const expenseByCategory = Object.entries(
      expenses.reduce((acc: Record<string, number>, e: any) => {
        acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0);
        return acc;
      }, {})
    )
      .map(([category, amount]) => ({ category, amount: r2(Number(amount)) }))
      .sort((a, b) => b.amount - a.amount);

    const paymentsByMethod = Object.entries(
      payments.reduce((acc: Record<string, number>, p: any) => {
        acc[p.method || "unknown"] = (acc[p.method || "unknown"] || 0) + Number(p.amount || 0);
        return acc;
      }, {})
    ).map(([method, amount]) => ({ method, amount: r2(Number(amount)) }));

    // Monthly revenue + profit trend
    const byMonth = new Map<string, { month: string; revenue: number; orders: number; profit: number }>();
    for (const o of orders as any[]) {
      const m = String(o.order_date).slice(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, { month: m, revenue: 0, orders: 0, profit: 0 });
      const agg = byMonth.get(m)!;
      agg.revenue += Number(o.total || 0);
      agg.orders += 1;
      for (const it of o.order_items || []) {
        const p: any = productById.get(it.product_id);
        agg.profit += (Number(it.unit_price || 0) - Number(p?.cost_usd || 0)) * Number(it.quantity || 0);
      }
    }
    const monthly = [...byMonth.values()]
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .map((m) => ({ month: m.month, orders: m.orders, revenue: r2(m.revenue), profit: r2(m.profit) }));

    // ---- Day / week / weekday breakdowns --------------------------------
    const isoWeek = (dateStr: string) => {
      const d = new Date(dateStr + "T00:00:00Z");
      const day = (d.getUTCDay() + 6) % 7; // Monday = 0
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - day);
      return monday.toISOString().slice(0, 10);
    };
    const weekdayName = (dateStr: string) =>
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(new Date(dateStr + "T00:00:00Z").getUTCDay() + 6) % 7];

    const byDay = new Map<
      string,
      {
        date: string;
        orders: number;
        revenue: number;
        units: number;
        profit: number;
        skus: Map<string, { sku: string; name: string; units: number; revenue: number }>;
        buyers: Map<string, number>;
      }
    >();
    const byWeek = new Map<string, { weekStart: string; orders: number; revenue: number; units: number; profit: number }>();
    const byWeekday = new Map<string, { weekday: string; orders: number; revenue: number }>();

    for (const o of orders as any[]) {
      const date = String(o.order_date).slice(0, 10);
      if (!byDay.has(date))
        byDay.set(date, { date, orders: 0, revenue: 0, units: 0, profit: 0, skus: new Map(), buyers: new Map() });
      const d = byDay.get(date)!;
      d.orders += 1;
      d.revenue += Number(o.total || 0);
      const buyerName = salonById.get(o.salon_id)?.name || o.customer_name || "Walk-in / Online";
      d.buyers.set(buyerName, (d.buyers.get(buyerName) || 0) + Number(o.total || 0));

      const wk = isoWeek(date);
      if (!byWeek.has(wk)) byWeek.set(wk, { weekStart: wk, orders: 0, revenue: 0, units: 0, profit: 0 });
      const w = byWeek.get(wk)!;
      w.orders += 1;
      w.revenue += Number(o.total || 0);

      const wd = weekdayName(date);
      if (!byWeekday.has(wd)) byWeekday.set(wd, { weekday: wd, orders: 0, revenue: 0 });
      const wdAgg = byWeekday.get(wd)!;
      wdAgg.orders += 1;
      wdAgg.revenue += Number(o.total || 0);

      for (const it of o.order_items || []) {
        const p: any = productById.get(it.product_id);
        const q = Number(it.quantity || 0);
        const rev = Number(it.line_total || 0);
        const prof = (Number(it.unit_price || 0) - Number(p?.cost_usd || 0)) * q;
        d.units += q;
        d.profit += prof;
        w.units += q;
        w.profit += prof;
        const sku = p?.sku || "—";
        if (!d.skus.has(sku)) d.skus.set(sku, { sku, name: p?.name || "Unknown", units: 0, revenue: 0 });
        const s = d.skus.get(sku)!;
        s.units += q;
        s.revenue += rev;
      }
    }

    const dailySorted = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    const dailyRevenue = dailySorted.map((d) => ({
      date: d.date,
      weekday: weekdayName(d.date),
      orders: d.orders,
      units: d.units,
      revenue: r2(d.revenue),
      profit: r2(d.profit),
    }));
    const dailyDetail = dailySorted.slice(0, 35).map((d) => ({
      date: d.date,
      weekday: weekdayName(d.date),
      orders: d.orders,
      revenue: r2(d.revenue),
      profit: r2(d.profit),
      topBuyers: [...d.buyers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, v]) => `${n} $${r2(v)}`),
      skus: [...d.skus.values()]
        .sort((a, b) => b.units - a.units)
        .slice(0, 30)
        .map((s) => ({ sku: s.sku, name: s.name, units: s.units, revenue: r2(s.revenue) })),
    }));
    const weeklyRevenue = [...byWeek.values()]
      .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))
      .map((w) => ({ weekStart: w.weekStart, orders: w.orders, units: w.units, revenue: r2(w.revenue), profit: r2(w.profit) }));

    const categoryPerformance = [...perCategory.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .map((c) => ({
        category: c.category,
        skusSold: c.skus.size,
        units: c.units,
        revenue: r2(c.revenue),
        profit: r2(c.profit),
        marginPercent: c.revenue > 0 ? +((c.profit / c.revenue) * 100).toFixed(1) : 0,
      }));
    const variantPerformance = [...perVariant.values()]
      .sort((a, b) => b.units - a.units)
      .slice(0, 60)
      .map((v) => ({
        variant: v.label,
        units: v.units,
        revenue: r2(v.revenue),
        profit: r2(v.profit),
        marginPercent: v.revenue > 0 ? +((v.profit / v.revenue) * 100).toFixed(1) : 0,
      }));

    const snapshot = {
      period: { days, since, today, previousWindow: { from: prevSince, to: since } },
      totals: {
        orders: orders.length,
        revenue: r2(revenue),
        previousPeriodRevenue: r2(prevRevenue),
        revenueChangePercent: prevRevenue > 0 ? +(((revenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : null,
        avgOrderValue: orders.length ? r2(revenue / orders.length) : 0,
        discounts: r2(discounts),
        tax: r2(taxTotal),
        shipping: r2(shippingTotal),
        grossProfit: r2(grossProfit),
        expenses: r2(expenseTotal),
        refunds: r2(refundTotal),
        referralCommissions: r2(commissionTotal),
        productionSpend: r2(productionSpend),
        paymentsCollected: r2(collected),
        outstandingBalance: r2(balanceDueTotal),
        netProfit: r2(grossProfit - expenseTotal - refundTotal - commissionTotal),
        websiteRevenue: r2(websiteRevenue),
        websiteOrders,
        inPersonRevenue: r2(inPersonRevenue),
        inPersonOrders,
        activeSalons: salons.filter((s: any) => s.is_active !== false).length,
        skuCount: products.length,
        skusSoldInPeriod: perProduct.size,
        inventoryValueAtCost,
        inventoryValueAtRetail,
      },
      profitDefinition:
        "grossProfit (a.k.a. Clean Profit) = sum over order lines of (unit_price - product cost_usd) x quantity. netProfit = grossProfit - expenses - refunds - referralCommissions. Products with cost 0 (see skusMissingCost) inflate profit.",
      skusMissingCost: missingCost,
      monthly,
      weeklyRevenue,
      dailyRevenue,
      dailyDetail,
      weekdayPattern: [...byWeekday.values()].sort((a, b) => b.revenue - a.revenue),
      lastActiveDay: dailyRevenue[0]?.date || null,
      orderStatusBreakdown: [...statusCount.values()].map((s) => ({ ...s, revenue: r2(s.revenue) })),
      categoryPerformance,
      variantPerformance,
      topProducts,
      topByProfit,
      bestMargins,
      worstMargins,
      worstProducts,
      neverSoldButInStock: neverSold,
      topBuyers,
      atRiskBuyers,
      openBalances,
      lowStock,
      stockBySku,
      expenseByCategory,
      paymentsByMethod,
      productionOrders: production.slice(0, 60).map((p: any) => ({
        sku: p.sku,
        product: p.product_name,
        supplier: p.supplier_name,
        qty: Number(p.quantity || 0),
        spent: r2(p.amount_spent),
        date: p.order_date,
      })),
      returns: returns.slice(0, 40).map((r: any) => ({
        date: String(r.created_at).slice(0, 10),
        amount: r2(r.refund_amount),
        method: r.refund_method,
        reason: r.reason,
      })),
    };

    const systemPrompt = `You are the senior business analyst for NÉRA Beauty, a nail-supply wholesale + e-commerce business. You report directly to the owner.
Today is ${today}. The snapshot covers ${days} days (from ${since}); a same-length previous window is summarised for comparison.

HOW TO WORK
1. Answer from the JSON snapshot only. Never invent a product, SKU, salon, customer or number.
2. Do the math yourself when the snapshot doesn't have a pre-computed figure: sum, average, rank, compute growth %, margin %, run rate, days of cover, projected stock-out dates. You are expected to calculate, not just look up.
3. Lead with the answer in one sentence, then a compact markdown table or tight bullets with the supporting numbers. Money as $1,234.56, percentages with one decimal.
4. Always add a short "So what" line: the single most useful implication or next action, grounded in the data.
5. When asked for recommendations, give 3-5 prioritized actions with the numbers that justify them (restock X — 2 left, 0.4/day run rate, ~5 days cover; push Y to salon Z — buys weekly, never ordered it; discontinue W — 0 sold, $310 cash tied up).
6. Keep it under ~300 words unless the owner asks for a full list or report.
7. Never say data is unavailable without checking every relevant key. If a date/SKU/salon simply has no rows, that means zero activity — say that plainly (e.g. "no sales on 2026-08-14").

WHAT THE DATA COVERS (all answerable)
- Time: dailyRevenue (every day, with weekday), dailyDetail (per-SKU + top buyers for the last 35 active days), weeklyRevenue (Monday-start), monthly (revenue + profit), weekdayPattern, lastActiveDay, totals.previousPeriodRevenue + revenueChangePercent.
- Products: topProducts / topByProfit / bestMargins / worstMargins / worstProducts each carry units, revenue, profit, marginPercent, cost, price, stockLeft, reorder, needsReorder, distinctBuyers, lastSold, daysSinceLastSale. stockBySku lists EVERY sku's stock, reserved, cost, price and units sold. neverSoldButInStock shows dead stock with tiedUpCost.
- Categories / variants: categoryPerformance and variantPerformance (units, revenue, profit, margin).
- Buyers: topBuyers (salon / website / walk-in, orders, revenue, profit, avgOrderValue, favorites, lastOrder, daysSinceLastOrder), atRiskBuyers (quiet 21+ days), openBalances (money owed).
- Money: totals (revenue, discounts, tax, shipping, grossProfit, netProfit, refunds, commissions, productionSpend, paymentsCollected, outstandingBalance, inventory value at cost and retail), expenseByCategory, paymentsByMethod, returns, productionOrders, orderStatusBreakdown, profitDefinition.
- Caveat to mention only when profit is the topic: SKUs in skusMissingCost have no cost, so their profit is overstated.

CONVERSATION
The earlier messages are this same session. Resolve follow-ups ("that salon", "those bits", "why?", "and last month?") from context, never ask the owner to repeat, and don't re-list something you already listed — answer only the new part.`;

    const history = (body.messages || []).slice(-20).map((m) => ({
      role: m.role,
      content: String(m.content || "").slice(0, 6000),
    }));

    const callModel = async (model: string) =>
      await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "system", content: `BUSINESS SNAPSHOT JSON:\n${JSON.stringify(snapshot)}` },
            ...history,
            { role: "user", content: question },
          ],
        }),
      });

    // Strongest reasoning model first; fall back to fast Flash on rate limit / upstream error.
    let resp = await callModel("google/gemini-3.1-pro-preview");
    let usedModel = "google/gemini-3.1-pro-preview";
    if (!resp.ok && (resp.status === 429 || resp.status >= 500)) {
      resp = await callModel("google/gemini-3.7-flash");
      usedModel = "google/gemini-3.7-flash";
    }

    if (!resp.ok) {
      const text = await resp.text();
      const status = resp.status === 429 || resp.status === 402 ? resp.status : 500;
      return j({ error: `AI error ${resp.status}: ${text}` }, status);
    }

    const data = await resp.json();
    const answer = data.choices?.[0]?.message?.content ?? "No answer generated.";

    return j({ answer, stats: snapshot.totals, model: usedModel });
  } catch (e: any) {
    return j({ error: e?.message || "Unexpected error" }, 500);
  }
});
