import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackagePlus, ShoppingCart, ArrowLeftRight, ClipboardEdit, RotateCcw, Package } from "lucide-react";

const TZ = "America/Los_Angeles";
const formatInPacific = (utc: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(utc).toLocaleString("en-US", { timeZone: TZ, ...opts });

interface Props {
  locationId: string;
  /** Per-store default discount (used as fallback when no per-product override exists). */
  storeDiscountPercent?: number;
  /** Whether this location is a supply store (consignment) — controls profit columns. */
  isSupplyStore?: boolean;
}

interface MovementRow {
  id: string;
  created_at: string;
  movement_type: "receive" | "transfer" | "sale" | "adjustment" | "return" | "initial";
  quantity: number;
  unit_cost: number | null;
  reason: string | null;
  from_location_id: string | null;
  to_location_id: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    cost_usd: number | null;
    wholesale_price_usd: number | null;
    price_usd: number;
    image_url: string | null;
    product_images?: { image_url: string; display_order: number | null }[];
  } | null;
}

const TYPE_META: Record<MovementRow["movement_type"], { label: string; icon: any; tone: string }> = {
  receive: { label: "Received", icon: PackagePlus, tone: "text-emerald-500" },
  initial: { label: "Initial", icon: Package, tone: "text-emerald-500" },
  sale: { label: "Sold", icon: ShoppingCart, tone: "text-primary" },
  transfer: { label: "Transfer", icon: ArrowLeftRight, tone: "text-blue-500" },
  adjustment: { label: "Adjusted", icon: ClipboardEdit, tone: "text-amber-500" },
  return: { label: "Returned", icon: RotateCcw, tone: "text-orange-500" },
};

type RangeKey = "7d" | "30d" | "90d" | "all";
type FilterKey = "all" | "receive" | "sale";

export function LocationHistoryTab({ locationId, storeDiscountPercent = 0, isSupplyStore = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [overrideMap, setOverrideMap] = useState<Map<string, number>>(new Map());
  const [range, setRange] = useState<RangeKey>("30d");
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const since =
        range === "all"
          ? null
          : new Date(
              Date.now() -
                ({ "7d": 7, "30d": 30, "90d": 90 } as Record<RangeKey, number>)[range] * 86400000,
            ).toISOString();

      let q = supabase
        .from("stock_movements")
        .select(
          "id, created_at, movement_type, quantity, unit_cost, reason, from_location_id, to_location_id, product:products(id, name, sku, cost_usd, wholesale_price_usd, price_usd, image_url, product_images(image_url, display_order))",
        )
        .or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (since) q = q.gte("created_at", since);

      const [movRes, priceRes] = await Promise.all([
        q,
        supabase
          .from("location_product_prices")
          .select("product_id, price_usd")
          .eq("location_id", locationId),
      ]);

      if (!active) return;

      const map = new Map<string, number>();
      ((priceRes.data ?? []) as any[]).forEach((r) =>
        map.set(r.product_id, Number(r.price_usd ?? 0)),
      );
      setOverrideMap(map);
      setRows(((movRes.data ?? []) as any[]) as MovementRow[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [locationId, range]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.movement_type === filter);
  }, [rows, filter]);

  // Compute analytics
  const stats = useMemo(() => {
    let unitsReceived = 0;
    let unitsSold = 0;
    let costReceived = 0; // our cost outlay on goods received
    let revenueIfSold = 0; // potential revenue at agreed store price for received goods
    let projectedProfit = 0;

    rows.forEach((r) => {
      if (!r.product) return;
      const cost =
        r.unit_cost != null
          ? Number(r.unit_cost)
          : Number(r.product.cost_usd ?? 0);
      const wholesale = Number(r.product.wholesale_price_usd ?? r.product.price_usd ?? 0);
      const fallbackStorePrice = wholesale * (1 - (storeDiscountPercent || 0) / 100);
      const storePrice = overrideMap.get(r.product.id) ?? fallbackStorePrice;

      if (r.movement_type === "receive" && r.to_location_id === locationId) {
        unitsReceived += r.quantity;
        costReceived += cost * r.quantity;
        revenueIfSold += storePrice * r.quantity;
        projectedProfit += (storePrice - cost) * r.quantity;
      }
      if (r.movement_type === "sale" && r.from_location_id === locationId) {
        unitsSold += r.quantity;
      }
    });

    const margin = revenueIfSold > 0 ? (projectedProfit / revenueIfSold) * 100 : 0;
    return { unitsReceived, unitsSold, costReceived, revenueIfSold, projectedProfit, margin };
  }, [rows, overrideMap, locationId, storeDiscountPercent]);

  // Group by date (Pacific time, day-bucket)
  const grouped = useMemo(() => {
    const byDay = new Map<string, MovementRow[]>();
    filtered.forEach((r) => {
      const d = formatInPacific(r.created_at, { year: "numeric", month: "short", day: "numeric" });
      const arr = byDay.get(d) ?? [];
      arr.push(r);
      byDay.set(d, arr);
    });
    return Array.from(byDay.entries());
  }, [filtered]);

  return (
    <div className="space-y-3">
      {/* Analytics summary */}
      {isSupplyStore ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] uppercase text-muted-foreground">Received</div>
              <div className="text-xl font-bold">{stats.unitsReceived.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">units in range</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] uppercase text-muted-foreground">Cost outlay</div>
              <div className="text-xl font-bold">
                ${stats.costReceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-[10px] text-muted-foreground">our cost</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] uppercase text-muted-foreground">Revenue (if sold)</div>
              <div className="text-xl font-bold text-primary">
                ${stats.revenueIfSold.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-[10px] text-muted-foreground">at store price</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] uppercase text-muted-foreground">Projected profit</div>
              <div
                className={`text-xl font-bold ${stats.projectedProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}
              >
                ${stats.projectedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-[10px] text-muted-foreground">{stats.margin.toFixed(1)}% margin</div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] uppercase text-muted-foreground">Received</div>
              <div className="text-xl font-bold">{stats.unitsReceived.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] uppercase text-muted-foreground">Sold</div>
              <div className="text-xl font-bold">{stats.unitsSold.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="receive">Received only</SelectItem>
            <SelectItem value="sale">Sold only</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
        </span>
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-12 px-4 text-center text-sm text-muted-foreground">
              No activity in this range yet.
            </div>
          ) : (
            <div className="divide-y">
              {grouped.map(([day, items]) => (
                <div key={day}>
                  <div className="px-3 py-1.5 bg-muted/30 text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
                    {day}
                  </div>
                  {items.map((r) => {
                    const meta = TYPE_META[r.movement_type];
                    const Icon = meta.icon;
                    const incoming = r.to_location_id === locationId;
                    const cost =
                      r.unit_cost != null
                        ? Number(r.unit_cost)
                        : Number(r.product?.cost_usd ?? 0);
                    const wholesale = Number(
                      r.product?.wholesale_price_usd ?? r.product?.price_usd ?? 0,
                    );
                    const fallbackStorePrice = wholesale * (1 - (storeDiscountPercent || 0) / 100);
                    const storePrice = r.product
                      ? overrideMap.get(r.product.id) ?? fallbackStorePrice
                      : 0;
                    const showProfit =
                      isSupplyStore && r.movement_type === "receive" && incoming;
                    const lineProfit = (storePrice - cost) * r.quantity;
                    return (
                      <div key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                        <div className={`mt-0.5 ${meta.tone}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">
                              {r.product?.name ?? "—"}
                            </span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1">
                              {meta.label}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                            <span>{r.product?.sku}</span>
                            <span>·</span>
                            <span>{formatInPacific(r.created_at, { hour: "numeric", minute: "2-digit" })}</span>
                            {r.reason && (
                              <>
                                <span>·</span>
                                <span className="truncate">{r.reason}</span>
                              </>
                            )}
                          </div>
                          {showProfit && (
                            <div className="text-[11px] mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span className="text-muted-foreground">
                                Cost <span className="text-foreground">${cost.toFixed(2)}</span>
                              </span>
                              <span className="text-muted-foreground">
                                Sell <span className="text-primary">${storePrice.toFixed(2)}</span>
                              </span>
                              <span
                                className={
                                  lineProfit >= 0 ? "text-emerald-500" : "text-destructive"
                                }
                              >
                                Profit ${lineProfit.toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div
                            className={`font-semibold text-sm ${
                              incoming ? "text-emerald-500" : "text-destructive"
                            }`}
                          >
                            {incoming ? "+" : "−"}
                            {r.quantity}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
