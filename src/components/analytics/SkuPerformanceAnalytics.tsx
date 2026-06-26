import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Sparkles, AlertTriangle, TrendingDown, TrendingUp, PackageX, Snowflake, Loader2, BarChart3, Filter, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { differenceInDays } from "date-fns";

interface Props {
  periodStart: Date;
  periodEnd: Date;
}

interface SkuRow {
  productId: string;
  sku: string;
  name: string;
  category: string;
  variant: string | null;
  units_sold: number;
  revenue: number;
  profit: number;
  total_units_sold: number;
  total_revenue: number;
  total_profit: number;
  cost_usd: number;
  stock: number;
  reorder_level: number;
  velocity_per_day: number;
  days_of_stock: number | null;
  product_age_days: number;
  is_bad_performer: boolean;
  badges: string[];
}

interface AiResult {
  summary: string;
  produce: { sku: string; name: string; qty: number; reason: string }[];
  discontinue: { sku: string; name: string; reason: string }[];
  trends: string[];
}

const ALL = "__all__";

export function SkuPerformanceAnalytics({ periodStart, periodEnd }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SkuRow[]>([]);
  const [category, setCategory] = useState<string>(ALL);
  const [variant, setVariant] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"all" | "top" | "bad" | "never">("all");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);

  const periodDays = Math.max(1, differenceInDays(periodEnd, periodStart) + 1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAiResult(null);
      try {
        const PAGE = 1000;

        const fetchOrderIds = async (start?: Date, end?: Date) => {
          const ids: string[] = [];
          for (let from = 0; ; from += PAGE) {
            let query: any = supabase
            .from("orders")
            .select("id")
            .in("status", ["Confirmed", "Shipped", "Delivered", "Paid"])
            .order("created_at", { ascending: true })
            .range(from, from + PAGE - 1);

            if (start) query = query.gte("created_at", start.toISOString());
            if (end) query = query.lte("created_at", end.toISOString());

            const { data, error } = await query;
            if (error) throw error;
            if (!data || data.length === 0) break;
            ids.push(...data.map((o: any) => o.id));
            if (data.length < PAGE) break;
          }
          return ids;
        };

        const fetchSalesByProduct = async (orderIds: string[]) => {
          const sales = new Map<string, { units: number; revenue: number }>();
          if (orderIds.length === 0) return sales;

          const ID_CHUNK = 300;
          for (let i = 0; i < orderIds.length; i += ID_CHUNK) {
            const chunk = orderIds.slice(i, i + ID_CHUNK);
            for (let from = 0; ; from += PAGE) {
              const { data, error } = await supabase
                .from("order_items")
                .select("product_id, quantity, line_total")
                .in("order_id", chunk)
                .range(from, from + PAGE - 1);
              if (error) throw error;
              if (!data || data.length === 0) break;
              data.forEach((it: any) => {
                if (!it.product_id) return;
                const cur = sales.get(it.product_id) ?? { units: 0, revenue: 0 };
                cur.units += Number(it.quantity ?? 0);
                cur.revenue += Number(it.line_total ?? 0);
                sales.set(it.product_id, cur);
              });
              if (data.length < PAGE) break;
            }
          }
          return sales;
        };

        const [periodOrderIds, lifetimeOrderIds] = await Promise.all([
          fetchOrderIds(periodStart, periodEnd),
          fetchOrderIds(),
        ]);

        const [salesByProduct, lifetimeSalesByProduct] = await Promise.all([
          fetchSalesByProduct(periodOrderIds),
          fetchSalesByProduct(lifetimeOrderIds),
        ]);

        // 3) Get ALL products (paginated)
        const productsAll: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("products")
            .select("id, sku, name, category, variant_name, bit_type, stock_on_hand, reorder_level, created_at, cost_usd")
            .order("sku", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          productsAll.push(...data);
          if (data.length < PAGE) break;
        }

        const built: SkuRow[] = productsAll.map((p: any) => {
          const s = salesByProduct.get(p.id) ?? { units: 0, revenue: 0 };
          const lifetime = lifetimeSalesByProduct.get(p.id) ?? { units: 0, revenue: 0 };
          const velocity = s.units / periodDays;
          const stock = Number(p.stock_on_hand ?? 0);
          const dos = velocity > 0 ? stock / velocity : stock > 0 ? null : 0;
          const productAgeDays = p.created_at
            ? Math.max(0, differenceInDays(periodEnd, new Date(p.created_at)))
            : periodDays;
          const cost = Number(p.cost_usd ?? 0);
          return {
            productId: p.id,
            sku: p.sku || "",
            name: p.name,
            category: p.category || "Uncategorized",
            variant: p.variant_name || p.bit_type || null,
            units_sold: s.units,
            revenue: s.revenue,
            profit: s.revenue - s.units * cost,
            total_units_sold: lifetime.units,
            total_revenue: lifetime.revenue,
            total_profit: lifetime.revenue - lifetime.units * cost,
            cost_usd: cost,
            stock,
            reorder_level: Number(p.reorder_level ?? 0),
            velocity_per_day: velocity,
            days_of_stock: dos,
            product_age_days: productAgeDays,
            is_bad_performer: false,
            badges: [],
          };
        });

        const percentile = (values: number[], pct: number) => {
          if (values.length === 0) return 0;
          const sorted = [...values].sort((a, b) => a - b);
          const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * pct)));
          return sorted[index];
        };

        // Compute performance inside each category / variant, not across unrelated products.
        const groupMap = new Map<string, SkuRow[]>();
        built.forEach((r) => {
          const key = `${r.category}::${r.variant ?? ""}`;
          const arr = groupMap.get(key) ?? [];
          arr.push(r);
          groupMap.set(key, arr);
        });
        groupMap.forEach((group) => {
          const currentSold = group.filter((g) => g.units_sold > 0).map((g) => g.units_sold);
          const lifetimeSold = group.filter((g) => g.total_units_sold > 0).map((g) => g.total_units_sold);
          const currentLowCutoff = Math.max(1, percentile(currentSold, 0.2));
          const currentMedian = percentile(currentSold, 0.5);
          const lifetimeLowCutoff = percentile(lifetimeSold, 0.25);
          const oldEnough = Math.min(14, periodDays);

          // Absolute floor: any SKU selling at a real clip is NEVER bad,
          // regardless of how its category peers performed.
          const perDay = periodDays > 0 ? 1 / periodDays : 0;
          const ABSOLUTE_GOOD_PERIOD = Math.max(10, Math.ceil(periodDays * 0.15)); // ~1 every ~7 days
          const ABSOLUTE_GOOD_LIFETIME = 25;

          group.forEach((g) => {
            const isOldEnough = g.product_age_days >= oldEnough;
            const sellsWell =
              g.units_sold >= ABSOLUTE_GOOD_PERIOD ||
              g.total_units_sold >= ABSOLUTE_GOOD_LIFETIME;

            const neverSold = g.total_units_sold === 0 && isOldEnough;
            const noPeriodSales = g.total_units_sold > 0 && g.units_sold === 0 && isOldEnough && !sellsWell;
            const nearZero =
              !sellsWell &&
              g.units_sold > 0 &&
              g.units_sold <= currentLowCutoff &&
              currentSold.length >= 5;
            const slowVsGroup =
              !sellsWell &&
              group.length >= 8 &&
              g.total_units_sold > 0 &&
              g.total_units_sold <= lifetimeLowCutoff &&
              g.units_sold <= currentLowCutoff &&
              isOldEnough;
            const stockRisk =
              g.stock > 0 &&
              (g.days_of_stock === null || g.days_of_stock > 150) &&
              g.units_sold <= currentMedian &&
              !sellsWell;

            if (g.product_age_days < oldEnough && g.total_units_sold === 0) g.badges.push("new");
            if (neverSold) g.badges.push("never-sold");
            else if (noPeriodSales) g.badges.push("no-period-sales");
            if (!neverSold && nearZero) g.badges.push("near-zero");
            if (!neverSold && slowVsGroup && !g.badges.includes("near-zero")) g.badges.push("slow-mover");
            if (stockRisk && !neverSold && !noPeriodSales) g.badges.push("stock-risk");

            g.is_bad_performer = !sellsWell && (neverSold || noPeriodSales || nearZero || slowVsGroup);
          });

        });

        setRows(built);
      } catch (e: any) {
        toast({ title: "Failed to load SKU performance", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [periodStart.getTime(), periodEnd.getTime()]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);
  const variants = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((r) => category === ALL || r.category === category)
            .map((r) => r.variant)
            .filter((v): v is string => !!v),
        ),
      ).sort(),
    [rows, category],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sortTopFirst = (a: SkuRow, b: SkuRow) =>
      b.units_sold - a.units_sold ||
      b.revenue - a.revenue ||
      b.total_units_sold - a.total_units_sold ||
      a.sku.localeCompare(b.sku);

    const base = rows
      .filter((r) => category === ALL || r.category === category)
      .filter((r) => variant === ALL || r.variant === variant)
      .filter(
        (r) => !q || r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
      )
      .sort(sortTopFirst);

    if (mode === "top") {
      // Top means every SKU with sales in the selected period, ordered best to lowest.
      return base.filter((r) => r.units_sold > 0).sort(sortTopFirst);
    }
    if (mode === "bad") {
      // Bad performers sorted by most-sold first so you can see the strongest
      // SKUs that are still flagged.
      return base.filter((r) => r.is_bad_performer).sort(sortTopFirst);
    }
    if (mode === "never") {
      // Never-sold SKUs only.
      return base
        .filter((r) => r.badges.includes("never-sold"))
        .sort((a, b) => b.product_age_days - a.product_age_days || a.sku.localeCompare(b.sku));
    }
    return base;

  }, [rows, category, variant, mode, search]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (a, r) => ({
          units: a.units + r.units_sold,
          revenue: a.revenue + r.revenue,
          profit: a.profit + r.profit,
          bad: a.bad + (r.is_bad_performer ? 1 : 0),
          neverSold: a.neverSold + (r.badges.includes("never-sold") ? 1 : 0),
          selling: a.selling + (r.units_sold > 0 ? 1 : 0),
        }),
        { units: 0, revenue: 0, profit: 0, bad: 0, neverSold: 0, selling: 0 },
      ),
    [filtered],
  );

  const handleAi = async () => {
    if (filtered.length === 0) {
      toast({ title: "Nothing to analyze", description: "Adjust filters first.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const label = `${category === ALL ? "All categories" : category}${
        variant === ALL ? "" : ` / ${variant}`
      }`;
      const { data, error } = await supabase.functions.invoke("ai-production-suggestions", {
        body: { skus: filtered, periodDays, categoryLabel: label },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAiResult(data as AiResult);
    } catch (e: any) {
      toast({
        title: "AI suggestion failed",
        description: e.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Loading SKU performance…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4 text-primary" /> Filter SKUs
          </div>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-4">
            <Select value={category} onValueChange={(v) => { setCategory(v); setVariant(ALL); }}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={variant} onValueChange={setVariant} disabled={variants.length === 0}>
              <SelectTrigger><SelectValue placeholder="Variant / type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All variants</SelectItem>
                {variants.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search SKU or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as "all" | "top" | "bad")}
              className="justify-start"
            >
              <ToggleGroupItem value="all" className="text-xs">
                <List className="h-3.5 w-3.5 mr-1" /> All
              </ToggleGroupItem>
              <ToggleGroupItem value="top" className="text-xs">
                <TrendingUp className="h-3.5 w-3.5 mr-1" /> Top
              </ToggleGroupItem>
              <ToggleGroupItem value="bad" className="text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Bad
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
            <Badge variant="secondary">{filtered.length} SKUs</Badge>
            <Badge variant="secondary">{totals.selling} selling</Badge>
            <Badge variant="secondary">{totals.units.toLocaleString()} units</Badge>
            <Badge variant="secondary">${totals.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} revenue</Badge>
            <Badge variant="secondary" className={totals.profit >= 0 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-destructive/15 text-destructive"}>
              ${totals.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })} profit
            </Badge>
            {totals.bad > 0 && (
              <Badge variant="destructive">{totals.bad} flagged</Badge>
            )}
            {totals.neverSold > 0 && (
              <Badge variant="outline">{totals.neverSold} never sold</Badge>
            )}
            <span className="ml-auto">Period: {periodDays} day{periodDays === 1 ? "" : "s"}</span>
          </div>
        </CardContent>
      </Card>

      {/* AI suggestion */}
      <Card className="shadow-[var(--shadow-card)] border-primary/30">
        <CardHeader className="p-4 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> AI production plan
          </CardTitle>
          <Button onClick={handleAi} disabled={aiLoading} size="sm">
            {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {aiResult ? "Regenerate" : "Generate suggestions"}
          </Button>
        </CardHeader>
        {aiResult && (
          <CardContent className="p-4 pt-0 space-y-4">
            {aiResult.summary && (
              <div className="text-sm p-3 rounded-md bg-muted/50 border">{aiResult.summary}</div>
            )}

            {aiResult.produce?.length > 0 && (
              <div>
                <div className="font-medium text-sm mb-2 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-600" /> Produce next ({aiResult.produce.length})
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2">SKU</th>
                        <th className="text-left p-2">Name</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-left p-2 hidden sm:table-cell">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiResult.produce.map((p, i) => (
                        <tr key={`${p.sku}-${i}`} className="border-t">
                          <td className="p-2 font-mono">{p.sku}</td>
                          <td className="p-2">{p.name}</td>
                          <td className="p-2 text-right font-bold text-emerald-600">{p.qty}</td>
                          <td className="p-2 text-muted-foreground hidden sm:table-cell">{p.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {aiResult.discontinue?.length > 0 && (
              <div>
                <div className="font-medium text-sm mb-2 flex items-center gap-2">
                  <PackageX className="h-4 w-4 text-destructive" /> Consider discontinuing ({aiResult.discontinue.length})
                </div>
                <ul className="text-xs space-y-1">
                  {aiResult.discontinue.map((d, i) => (
                    <li key={`${d.sku}-${i}`} className="flex items-start gap-2">
                      <span className="font-mono">{d.sku}</span>
                      <span>{d.name}</span>
                      <span className="text-muted-foreground">— {d.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiResult.trends?.length > 0 && (
              <div>
                <div className="font-medium text-sm mb-2">Trends</div>
                <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                  {aiResult.trends.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        )}
        {!aiResult && !aiLoading && (
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Click generate to get a restock list with suggested quantities, items to discontinue, and category trends — based on the currently filtered SKUs.
          </CardContent>
        )}
      </Card>

      {/* SKU table */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-4 flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">SKU performance</CardTitle>
          <Badge variant="secondary" className="shrink-0">
            Showing {filtered.length} of {rows.length} SKUs
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No SKUs match these filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">SKU</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2 hidden md:table-cell">Variant</th>
                      <th className="text-right p-2">Sold</th>
                    <th className="text-right p-2 hidden sm:table-cell">Revenue</th>
                    <th className="text-right p-2 hidden md:table-cell">Profit</th>
                    <th className="text-right p-2 hidden sm:table-cell">Stock</th>
                    <th className="text-right p-2 hidden md:table-cell">Days of stock</th>
                    <th className="text-left p-2">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.productId} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono">{r.sku || "—"}</td>
                      <td className="p-2">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground">{r.category}</div>
                      </td>
                      <td className="p-2 hidden md:table-cell text-muted-foreground">{r.variant ?? "—"}</td>
                      <td className="p-2 text-right">
                        <div className="font-semibold">{r.units_sold}</div>
                        {r.total_units_sold !== r.units_sold && (
                          <div className="text-[10px] text-muted-foreground">All {r.total_units_sold}</div>
                        )}
                      </td>
                      <td className="p-2 text-right hidden sm:table-cell">${r.revenue.toFixed(0)}</td>
                      <td className={`p-2 text-right hidden md:table-cell ${r.profit < 0 ? "text-destructive" : r.profit > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                        {r.cost_usd > 0 ? `$${r.profit.toFixed(0)}` : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 text-right hidden sm:table-cell">{r.stock}</td>
                      <td className="p-2 text-right hidden md:table-cell">
                        {r.days_of_stock === null
                          ? "∞"
                          : r.days_of_stock === 0
                          ? "—"
                          : Math.round(r.days_of_stock)}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {r.badges.includes("new") && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-0.5">
                              New
                            </Badge>
                          )}
                          {r.badges.includes("never-sold") && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1.5 gap-0.5">
                              <Snowflake className="h-2.5 w-2.5" /> Never sold
                            </Badge>
                          )}
                          {r.badges.includes("no-period-sales") && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1.5 gap-0.5">
                              <Snowflake className="h-2.5 w-2.5" /> No sales
                            </Badge>
                          )}
                          {r.badges.includes("near-zero") && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 border-orange-500/50 text-orange-600">
                              <TrendingDown className="h-2.5 w-2.5" /> Near-zero
                            </Badge>
                          )}
                          {r.badges.includes("slow-mover") && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 border-orange-500/50 text-orange-600">
                              <TrendingDown className="h-2.5 w-2.5" /> Slow
                            </Badge>
                          )}
                          {r.badges.includes("stock-risk") && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 border-amber-500/50 text-amber-600">
                              <PackageX className="h-2.5 w-2.5" /> Stock risk
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Showing {filtered.length} SKU{filtered.length === 1 ? "" : "s"} from {rows.length} loaded product SKU{rows.length === 1 ? "" : "s"}.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
