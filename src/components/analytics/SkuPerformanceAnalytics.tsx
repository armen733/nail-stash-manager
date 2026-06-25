import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, AlertTriangle, TrendingDown, PackageX, Snowflake, Loader2, BarChart3, Filter } from "lucide-react";
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
  stock: number;
  reorder_level: number;
  velocity_per_day: number;
  days_of_stock: number | null;
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
  const [showBadOnly, setShowBadOnly] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);

  const periodDays = Math.max(1, differenceInDays(periodEnd, periodStart) + 1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAiResult(null);
      try {
        // 1) Get order IDs in period (paginated — Supabase caps at 1000 per page)
        const orderIds: string[] = [];
        const PAGE = 1000;
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("orders")
            .select("id")
            .gte("created_at", periodStart.toISOString())
            .lte("created_at", periodEnd.toISOString())
            .in("status", ["Confirmed", "Shipped", "Delivered", "Paid"])
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          orderIds.push(...data.map((o) => o.id));
          if (data.length < PAGE) break;
        }

        // 2) Get order_items for those orders, in chunks of order IDs and paginated rows
        const salesByProduct = new Map<string, { units: number; revenue: number }>();
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
              const cur = salesByProduct.get(it.product_id) ?? { units: 0, revenue: 0 };
              cur.units += Number(it.quantity ?? 0);
              cur.revenue += Number(it.line_total ?? 0);
              salesByProduct.set(it.product_id, cur);
            });
            if (data.length < PAGE) break;
          }
        }

        // 3) Get ALL products (paginated)
        const productsAll: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("products")
            .select("id, sku, name, category, variant_name, bit_type, stock_on_hand, reorder_level")
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          productsAll.push(...data);
          if (data.length < PAGE) break;
        }

        const built: SkuRow[] = productsAll.map((p: any) => {
          const s = salesByProduct.get(p.id) ?? { units: 0, revenue: 0 };
          const velocity = s.units / periodDays;
          const stock = Number(p.stock_on_hand ?? 0);
          const dos = velocity > 0 ? stock / velocity : stock > 0 ? null : 0;
          return {
            productId: p.id,
            sku: p.sku || "",
            name: p.name,
            category: p.category || "Uncategorized",
            variant: p.variant_name || p.bit_type || null,
            units_sold: s.units,
            revenue: s.revenue,
            stock,
            reorder_level: Number(p.reorder_level ?? 0),
            velocity_per_day: velocity,
            days_of_stock: dos,
            badges: [],
          };
        });

        // Compute badges per (category, variant) group
        const groupMap = new Map<string, SkuRow[]>();
        built.forEach((r) => {
          const key = `${r.category}::${r.variant ?? ""}`;
          const arr = groupMap.get(key) ?? [];
          arr.push(r);
          groupMap.set(key, arr);
        });
        groupMap.forEach((group) => {
          const sold = group.filter((g) => g.units_sold > 0).sort((a, b) => a.units_sold - b.units_sold);
          const bottomCount = Math.max(1, Math.floor(sold.length * 0.2));
          const bottomSet = new Set(sold.slice(0, bottomCount).map((g) => g.productId));
          group.forEach((g) => {
            if (g.units_sold === 0) g.badges.push("no-sales");
            else if (g.units_sold <= 2) g.badges.push("zero-sales");
            if (bottomSet.has(g.productId) && g.badges.length === 0) g.badges.push("low-units");
            if (g.stock > 0 && (g.days_of_stock === null || g.days_of_stock > 90)) g.badges.push("overstocked");
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
    return rows
      .filter((r) => category === ALL || r.category === category)
      .filter((r) => variant === ALL || r.variant === variant)
      .filter((r) => !showBadOnly || r.badges.length > 0)
      .filter(
        (r) => !q || r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
      )
      .sort((a, b) => b.units_sold - a.units_sold);
  }, [rows, category, variant, showBadOnly, search]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (a, r) => ({
          units: a.units + r.units_sold,
          revenue: a.revenue + r.revenue,
          bad: a.bad + (r.badges.length > 0 ? 1 : 0),
        }),
        { units: 0, revenue: 0, bad: 0 },
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
            <Button
              variant={showBadOnly ? "destructive" : "outline"}
              onClick={() => setShowBadOnly((v) => !v)}
              className="justify-start"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {showBadOnly ? "Showing bad performers" : "Show bad performers"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
            <Badge variant="secondary">{filtered.length} SKUs</Badge>
            <Badge variant="secondary">{totals.units.toLocaleString()} units</Badge>
            <Badge variant="secondary">${totals.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} revenue</Badge>
            {totals.bad > 0 && (
              <Badge variant="destructive">{totals.bad} flagged</Badge>
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
        <CardHeader className="p-4">
          <CardTitle className="text-base">SKU performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No SKUs match these filters.</div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">SKU</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2 hidden md:table-cell">Variant</th>
                    <th className="text-right p-2">Sold</th>
                    <th className="text-right p-2 hidden sm:table-cell">Revenue</th>
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
                      <td className="p-2 text-right font-semibold">{r.units_sold}</td>
                      <td className="p-2 text-right hidden sm:table-cell">${r.revenue.toFixed(0)}</td>
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
                          {r.badges.includes("zero-sales") && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1.5 gap-0.5">
                              <Snowflake className="h-2.5 w-2.5" /> Zero
                            </Badge>
                          )}
                          {r.badges.includes("low-units") && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 border-orange-500/50 text-orange-600">
                              <TrendingDown className="h-2.5 w-2.5" /> Low
                            </Badge>
                          )}
                          {r.badges.includes("overstocked") && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 border-amber-500/50 text-amber-600">
                              <PackageX className="h-2.5 w-2.5" /> Overstock
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
