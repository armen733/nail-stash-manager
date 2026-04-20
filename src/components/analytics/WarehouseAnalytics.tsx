import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Warehouse, Trophy, TrendingUp, TrendingDown, Boxes, DollarSign } from "lucide-react";
import { format, eachDayOfInterval, differenceInDays, subDays } from "date-fns";

interface Props {
  periodStart: Date;
  periodEnd: Date;
}

interface LocRow {
  id: string;
  name: string;
  type: string;
  is_default: boolean;
  is_active: boolean;
}

interface SalesRow {
  warehouse: string;
  warehouseId: string;
  type: string;
  units: number;
  revenue: number;
  orders: number;
  prevRevenue: number;
}

interface StockValueRow {
  warehouse: string;
  type: string;
  units: number;
  skus: number;
  costValue: number;
  retailValue: number;
  lowSkus: number;
}

const TYPE_COLORS: Record<string, string> = {
  warehouse: "hsl(var(--primary))",
  fba: "hsl(25 95% 53%)",
  driver: "hsl(217 91% 60%)",
  consignment: "hsl(271 76% 53%)",
};

export function WarehouseAnalytics({ periodStart, periodEnd }: Props) {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<LocRow[]>([]);
  const [sales, setSales] = useState<SalesRow[]>([]);
  const [stockValue, setStockValue] = useState<StockValueRow[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [trendKeys, setTrendKeys] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const periodStartIso = periodStart.toISOString();
      const periodEndIso = periodEnd.toISOString();
      const periodDays = Math.max(1, differenceInDays(periodEnd, periodStart) + 1);
      const prevStart = subDays(periodStart, periodDays);
      const prevEnd = subDays(periodEnd, periodDays);

      const [locRes, currentMovesRes, prevMovesRes, stockRes, productsRes] = await Promise.all([
        supabase.from("stock_locations").select("id, name, type, is_default, is_active"),
        supabase
          .from("stock_movements")
          .select("from_location_id, quantity, unit_cost, created_at, reference_id")
          .eq("movement_type", "sale")
          .gte("created_at", periodStartIso)
          .lte("created_at", periodEndIso),
        supabase
          .from("stock_movements")
          .select("from_location_id, quantity, unit_cost")
          .eq("movement_type", "sale")
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString()),
        supabase.from("product_stock").select("location_id, product_id, quantity").gt("quantity", 0),
        supabase.from("products").select("id, cost_usd, price_usd, reorder_level"),
      ]);

      const locs = (locRes.data ?? []) as LocRow[];
      setLocations(locs);
      const locById = new Map(locs.map((l) => [l.id, l]));

      // Sales aggregation
      const salesAgg = new Map<string, { units: number; revenue: number; orders: Set<string> }>();
      ((currentMovesRes.data ?? []) as any[]).forEach((m) => {
        if (!m.from_location_id) return;
        const cur = salesAgg.get(m.from_location_id) ?? {
          units: 0,
          revenue: 0,
          orders: new Set<string>(),
        };
        cur.units += Number(m.quantity ?? 0);
        cur.revenue += Number(m.quantity ?? 0) * Number(m.unit_cost ?? 0);
        if (m.reference_id) cur.orders.add(m.reference_id);
        salesAgg.set(m.from_location_id, cur);
      });
      const prevAgg = new Map<string, number>();
      ((prevMovesRes.data ?? []) as any[]).forEach((m) => {
        if (!m.from_location_id) return;
        prevAgg.set(
          m.from_location_id,
          (prevAgg.get(m.from_location_id) ?? 0) +
            Number(m.quantity ?? 0) * Number(m.unit_cost ?? 0)
        );
      });

      const salesRows: SalesRow[] = [];
      locs.forEach((l) => {
        const cur = salesAgg.get(l.id);
        if (!cur && !prevAgg.get(l.id)) return;
        salesRows.push({
          warehouse: l.name,
          warehouseId: l.id,
          type: l.type,
          units: cur?.units ?? 0,
          revenue: cur?.revenue ?? 0,
          orders: cur?.orders.size ?? 0,
          prevRevenue: prevAgg.get(l.id) ?? 0,
        });
      });
      salesRows.sort((a, b) => b.revenue - a.revenue);
      setSales(salesRows);

      // Stock value per warehouse
      const productMap = new Map<string, { cost: number; price: number; reorder: number }>();
      ((productsRes.data ?? []) as any[]).forEach((p) => {
        productMap.set(p.id, {
          cost: Number(p.cost_usd ?? 0),
          price: Number(p.price_usd ?? 0),
          reorder: Number(p.reorder_level ?? 0),
        });
      });
      const stockAgg = new Map<
        string,
        { units: number; skus: number; cost: number; retail: number; low: number }
      >();
      ((stockRes.data ?? []) as any[]).forEach((row) => {
        const qty = Number(row.quantity ?? 0);
        if (qty <= 0) return;
        const prod = productMap.get(row.product_id);
        const costPer = prod?.cost && prod.cost > 0 ? prod.cost : prod?.price ?? 0;
        const retailPer = prod?.price ?? 0;
        const cur =
          stockAgg.get(row.location_id) ?? { units: 0, skus: 0, cost: 0, retail: 0, low: 0 };
        cur.units += qty;
        cur.skus += 1;
        cur.cost += qty * costPer;
        cur.retail += qty * retailPer;
        if (prod && prod.reorder > 0 && qty <= prod.reorder) cur.low += 1;
        stockAgg.set(row.location_id, cur);
      });
      const stockRows: StockValueRow[] = [];
      locs.forEach((l) => {
        const cur = stockAgg.get(l.id);
        if (!cur) return;
        stockRows.push({
          warehouse: l.name,
          type: l.type,
          units: cur.units,
          skus: cur.skus,
          costValue: cur.cost,
          retailValue: cur.retail,
          lowSkus: cur.low,
        });
      });
      stockRows.sort((a, b) => b.retailValue - a.retailValue);
      setStockValue(stockRows);

      // Trend per warehouse over time
      const days = eachDayOfInterval({ start: periodStart, end: periodEnd });
      const useDaily = days.length <= 31;
      const bucket = (d: Date) =>
        useDaily ? format(d, "yyyy-MM-dd") : format(d, "yyyy-'W'II");

      const buckets = new Map<string, Record<string, number>>();
      days.forEach((d) => {
        const key = bucket(d);
        if (!buckets.has(key)) buckets.set(key, {});
      });
      const activeWarehouseNames = new Set<string>();
      ((currentMovesRes.data ?? []) as any[]).forEach((m) => {
        if (!m.from_location_id) return;
        const loc = locById.get(m.from_location_id);
        if (!loc) return;
        const key = bucket(new Date(m.created_at));
        const row = buckets.get(key) ?? {};
        const rev = Number(m.quantity ?? 0) * Number(m.unit_cost ?? 0);
        row[loc.name] = (row[loc.name] ?? 0) + rev;
        buckets.set(key, row);
        activeWarehouseNames.add(loc.name);
      });
      const trendRows = Array.from(buckets.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, vals]) => ({
          label: useDaily ? format(new Date(key), "MMM dd") : key,
          ...vals,
        }));
      setTrendData(trendRows);
      setTrendKeys(Array.from(activeWarehouseNames));

      setLoading(false);
    };
    load();
  }, [periodStart, periodEnd]);

  const totals = useMemo(
    () =>
      sales.reduce(
        (a, s) => ({
          revenue: a.revenue + s.revenue,
          units: a.units + s.units,
          orders: a.orders + s.orders,
        }),
        { revenue: 0, units: 0, orders: 0 }
      ),
    [sales]
  );

  const stockTotals = useMemo(
    () =>
      stockValue.reduce(
        (a, s) => ({
          units: a.units + s.units,
          cost: a.cost + s.costValue,
          retail: a.retail + s.retailValue,
        }),
        { units: 0, cost: 0, retail: 0 }
      ),
    [stockValue]
  );

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading warehouse analytics…</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ranking leaderboard */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Trophy className="h-5 w-5 text-primary" /> Warehouse ranking
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          {sales.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No sales recorded in this period yet.
            </div>
          ) : (
            <div className="space-y-2">
              {sales.map((s, i) => {
                const change =
                  s.prevRevenue > 0
                    ? ((s.revenue - s.prevRevenue) / s.prevRevenue) * 100
                    : s.revenue > 0
                    ? 100
                    : 0;
                const share =
                  totals.revenue > 0 ? (s.revenue / totals.revenue) * 100 : 0;
                return (
                  <div
                    key={s.warehouseId}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold flex-shrink-0 ${
                        i === 0
                          ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                          : i === 1
                          ? "bg-zinc-400/20 text-zinc-600 dark:text-zinc-300"
                          : i === 2
                          ? "bg-orange-600/20 text-orange-700 dark:text-orange-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{s.warehouse}</div>
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {s.type}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {s.units.toLocaleString()} units · {s.orders} orders ·{" "}
                        {share.toFixed(1)}% of total
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-sm">
                        ${s.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div
                        className={`text-[11px] flex items-center justify-end gap-0.5 ${
                          change > 0
                            ? "text-emerald-600"
                            : change < 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {change > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : change < 0 ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : null}
                        {change > 0 ? "+" : ""}
                        {change.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Sales by warehouse bar chart */}
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <DollarSign className="h-5 w-5 text-primary" /> Sales by warehouse
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {sales.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={sales} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="warehouse"
                    tick={{ fontSize: 11 }}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: any, name: string) =>
                      name === "revenue"
                        ? [`$${Number(value).toLocaleString()}`, "Revenue"]
                        : [value, name]
                    }
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Stock value by warehouse */}
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Boxes className="h-5 w-5 text-primary" /> Stock value by warehouse
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {stockValue.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No on-hand stock.
              </div>
            ) : (
              <div className="space-y-2">
                {stockValue.map((s) => {
                  const share =
                    stockTotals.retail > 0 ? (s.retailValue / stockTotals.retail) * 100 : 0;
                  return (
                    <div key={s.warehouse} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Warehouse className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium truncate">{s.warehouse}</span>
                          {s.lowSkus > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                              {s.lowSkus} low
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex-shrink-0">
                          {s.units.toLocaleString()} units · {s.skus} SKUs
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded overflow-hidden">
                        <div
                          className="h-full bg-primary rounded"
                          style={{ width: `${Math.max(2, share)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          Cost ${s.costValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-primary font-medium">
                          Retail $
                          {s.retailValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 mt-2 border-t flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total retail</span>
                  <span className="font-bold text-primary">
                    ${stockTotals.retail.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales trend per warehouse */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <TrendingUp className="h-5 w-5 text-primary" /> Sales trend per warehouse
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          {trendKeys.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No sales in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: any) => `$${Number(v).toLocaleString()}`}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {trendKeys.map((name, i) => {
                  const loc = locations.find((l) => l.name === name);
                  const color = TYPE_COLORS[loc?.type ?? "warehouse"] ?? "hsl(var(--primary))";
                  return (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
