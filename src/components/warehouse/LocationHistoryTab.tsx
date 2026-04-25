import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PackagePlus, ShoppingCart, ArrowLeftRight, ClipboardEdit, RotateCcw, Package, Download, Trash2 } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { toast } from "sonner";

const TZ = "America/Los_Angeles";
const formatInPacific = (utc: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(utc).toLocaleString("en-US", { timeZone: TZ, ...opts });

interface Props {
  locationId: string;
  /** Per-store default discount (used as fallback when no per-product override exists). */
  storeDiscountPercent?: number;
  /** Per-store default markup % the store applies on top of what they paid us. */
  storeMarkupPercent?: number;
  /** Whether this location is a supply store (consignment) — controls profit columns. */
  isSupplyStore?: boolean;
  /** Lets the parent refresh current stock after a delivery is removed from the store. */
  onStockChanged?: () => void;
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

type RangeKey =
  | "7d"
  | "30d"
  | "90d"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "all";
type FilterKey = "all" | "receive" | "sale";

/** Returns ISO since-date for a range key, or null for all-time. */
function rangeSince(key: RangeKey): string | null {
  const now = new Date();
  if (key === "all") return null;
  if (key === "7d") return new Date(Date.now() - 7 * 86400000).toISOString();
  if (key === "30d") return new Date(Date.now() - 30 * 86400000).toISOString();
  if (key === "90d") return new Date(Date.now() - 90 * 86400000).toISOString();
  if (key === "this_month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  if (key === "last_month") {
    return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  }
  if (key === "last_3_months") {
    return new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
  }
  if (key === "last_6_months") {
    return new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();
  }
  if (key === "this_year") {
    return new Date(now.getFullYear(), 0, 1).toISOString();
  }
  return null;
}

/** Returns ISO until-date (exclusive) for ranges that have an upper bound. */
function rangeUntil(key: RangeKey): string | null {
  const now = new Date();
  if (key === "last_month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  return null;
}

export function LocationHistoryTab({ locationId, storeDiscountPercent = 0, storeMarkupPercent = 0, isSupplyStore = false, onStockChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [overrideMap, setOverrideMap] = useState<Map<string, number>>(new Map());
  const [markupOverrideMap, setMarkupOverrideMap] = useState<Map<string, number>>(new Map());
  const [range, setRange] = useState<RangeKey>("30d");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [confirmDelete, setConfirmDelete] = useState<MovementRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [locationNameMap, setLocationNameMap] = useState<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const since = rangeSince(range);
      const until = rangeUntil(range);

      let q = supabase
        .from("stock_movements")
        .select(
          "id, created_at, movement_type, quantity, unit_cost, reason, from_location_id, to_location_id, product:products(id, name, sku, cost_usd, wholesale_price_usd, price_usd, image_url, product_images(image_url, display_order))",
        )
        .or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (since) q = q.gte("created_at", since);
      if (until) q = q.lt("created_at", until);

      // Look up supply_store_id (if any) so we can fetch markup overrides
      const { data: locRow } = await supabase
        .from("stock_locations")
        .select("type, supply_store_id")
        .eq("id", locationId)
        .maybeSingle();
      const supplyStoreId =
        locRow?.type === "consignment" ? locRow?.supply_store_id ?? null : null;

      const [movRes, priceRes, markupRes] = await Promise.all([
        q,
        supabase
          .from("location_product_prices")
          .select("product_id, price_usd")
          .eq("location_id", locationId),
        supplyStoreId
          ? supabase
              .from("supply_store_products")
              .select("product_id, markup_percent_override")
              .eq("supply_store_id", supplyStoreId)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      if (!active) return;

      const map = new Map<string, number>();
      ((priceRes.data ?? []) as any[]).forEach((r) =>
        map.set(r.product_id, Number(r.price_usd ?? 0)),
      );
      setOverrideMap(map);

      const mMap = new Map<string, number>();
      ((markupRes as any)?.data ?? []).forEach((r: any) => {
        if (r.markup_percent_override != null) {
          mMap.set(r.product_id, Number(r.markup_percent_override));
        }
      });
      setMarkupOverrideMap(mMap);

      const movs = ((movRes.data ?? []) as any[]) as MovementRow[];

      // Resolve names for the OTHER side of each movement so we can show
      // "From: Main Warehouse" etc. in the entry list.
      const otherIds = new Set<string>();
      movs.forEach((m) => {
        if (m.from_location_id && m.from_location_id !== locationId) {
          otherIds.add(m.from_location_id);
        }
        if (m.to_location_id && m.to_location_id !== locationId) {
          otherIds.add(m.to_location_id);
        }
      });
      const nameMap = new Map<string, string>();
      if (otherIds.size > 0) {
        const { data: locs } = await supabase
          .from("stock_locations")
          .select("id, name")
          .in("id", Array.from(otherIds));
        ((locs ?? []) as any[]).forEach((l) => nameMap.set(l.id, l.name));
      }
      if (!active) return;
      setLocationNameMap(nameMap);

      setRows(movs);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [locationId, range, reloadKey]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.movement_type === filter);
  }, [rows, filter]);

  // Compute analytics
  const stats = useMemo(() => {
    let unitsReceived = 0;
    let unitsSold = 0;
    let costReceived = 0; // our cost outlay on goods received
    let weChargeStore = 0; // total $ the store owes us for received goods
    let ourProfit = 0; // weChargeStore - costReceived
    let storeRevenueIfSold = 0; // store's revenue if they sell at suggested resell
    let storeEarning = 0; // storeRevenueIfSold - weChargeStore

    rows.forEach((r) => {
      if (!r.product) return;
      const cost = Number(r.product.cost_usd ?? 0);
      const wholesale = Number(r.product.wholesale_price_usd ?? r.product.price_usd ?? 0);
      const retail = Number(r.product.price_usd ?? 0);
      const fallbackStorePrice = wholesale * (1 - (storeDiscountPercent || 0) / 100);
      const storePrice = overrideMap.get(r.product.id) ?? fallbackStorePrice;

      // Suggested resell: markup is applied to OUR LIST price (not to the discounted store cost),
      // so the store's earnings reflect the catalog price. If no markup is set, default to retail.
      const markupPct = markupOverrideMap.get(r.product.id) ?? storeMarkupPercent ?? 0;
      const suggestedResell =
        markupPct > 0 ? retail * (1 + markupPct / 100) : retail;

      if (r.movement_type === "receive" && r.to_location_id === locationId) {
        unitsReceived += r.quantity;
        costReceived += cost * r.quantity;
        weChargeStore += storePrice * r.quantity;
        ourProfit += (storePrice - cost) * r.quantity;
        storeRevenueIfSold += suggestedResell * r.quantity;
        storeEarning += (suggestedResell - storePrice) * r.quantity;
      }
      if (r.movement_type === "sale" && r.from_location_id === locationId) {
        unitsSold += r.quantity;
      }
    });

    const margin = costReceived > 0 ? (ourProfit / costReceived) * 100 : 0;
    const storeMargin = weChargeStore > 0 ? (storeEarning / weChargeStore) * 100 : 0;
    return {
      unitsReceived,
      unitsSold,
      costReceived,
      weChargeStore,
      ourProfit,
      margin,
      storeRevenueIfSold,
      storeEarning,
      storeMargin,
    };
  }, [rows, overrideMap, markupOverrideMap, locationId, storeDiscountPercent, storeMarkupPercent]);

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

  const handleDeleteReceive = async (r: MovementRow) => {
    if (!r.product) return;
    setDeleting(true);
    try {
      // Find the default warehouse to receive the returned units
      const { data: defaultLoc, error: locErr } = await supabase
        .from("stock_locations")
        .select("id, name")
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();
      if (locErr) throw locErr;
      if (!defaultLoc) {
        toast.error("No default warehouse found to restore stock to");
        setDeleting(false);
        setConfirmDelete(null);
        return;
      }

      // Return whatever stock is still available here; sold units stay sold.
      const { data: stockRow } = await supabase
        .from("product_stock")
        .select("quantity")
        .eq("product_id", r.product.id)
        .eq("location_id", locationId)
        .maybeSingle();
      const available = Number(stockRow?.quantity ?? 0);
      const quantityToReturn = Math.min(available, r.quantity);
      if (quantityToReturn <= 0) {
        toast.info("No units left at this store to remove");
        setDeleting(false);
        setConfirmDelete(null);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      // Insert a transfer movement back to the default warehouse
      const { error: movErr } = await supabase.from("stock_movements").insert({
        product_id: r.product.id,
        movement_type: "transfer",
        quantity: quantityToReturn,
        from_location_id: locationId,
        to_location_id: defaultLoc.id,
        unit_cost: r.unit_cost,
        reason: `Reverted delivery (movement ${r.id.slice(0, 8)})`,
        reference_type: "reversal",
        reference_id: r.id,
        created_by: userId,
      });
      if (movErr) throw movErr;

      toast.success(`Removed ${quantityToReturn} unit${quantityToReturn === 1 ? "" : "s"} from this store`);
      setConfirmDelete(null);
      setReloadKey((k) => k + 1);
      onStockChanged?.();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to revert delivery");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
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
        {isSupplyStore && (
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => {
              const receivedRows = rows.filter(
                (r) => r.movement_type === "receive" && r.to_location_id === locationId && r.product,
              );
              if (receivedRows.length === 0) {
                toast.error("No received entries to export in this range");
                return;
              }
              const data = receivedRows.map((r) => {
                // Use the real product cost from the catalog (not movement.unit_cost,
                // which may store the price paid by the supply store).
                const cost = Number(r.product!.cost_usd ?? 0);
                const wholesale = Number(
                  r.product!.wholesale_price_usd ?? r.product!.price_usd ?? 0,
                );
                const fallbackStorePrice = wholesale * (1 - (storeDiscountPercent || 0) / 100);
                const sellToStore = overrideMap.get(r.product!.id) ?? fallbackStorePrice;
                const lineRevenue = sellToStore * r.quantity;
                const lineCost = cost * r.quantity;
                const lineProfit = lineRevenue - lineCost;
                const profitPct = cost > 0 ? (lineProfit / lineCost) * 100 : 0;
                return {
                  Date: formatInPacific(r.created_at, {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }),
                  SKU: r.product!.sku,
                  Product: r.product!.name,
                  Units: r.quantity,
                  "Cost (unit)": cost.toFixed(2),
                  "Sell (unit)": sellToStore.toFixed(2),
                  "Total Cost": lineCost.toFixed(2),
                  "Total Sell": lineRevenue.toFixed(2),
                  "Profit ($)": lineProfit.toFixed(2),
                  "Profit (%)": profitPct.toFixed(1),
                };
              });
              downloadCSV(data, "supply-store-deliveries");
              toast.success(`Exported ${data.length} delivery line${data.length === 1 ? "" : "s"}`);
            }}
          >
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
        )}
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
              {grouped.map(([day, items]) => {
                const skuSet = new Set<string>();
                let inUnits = 0;
                let outUnits = 0;
                items.forEach((m) => {
                  if (m.product?.id) skuSet.add(m.product.id);
                  if (m.to_location_id === locationId) inUnits += m.quantity;
                  if (m.from_location_id === locationId) outUnits += m.quantity;
                });
                return (
                <div key={day}>
                  <div className="px-3 py-1.5 bg-muted/30 flex items-center justify-between gap-2">
                    <div className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
                      {day}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>{skuSet.size} SKU{skuSet.size === 1 ? "" : "s"}</span>
                      {inUnits > 0 && (
                        <span className="text-emerald-500 font-medium">+{inUnits} units</span>
                      )}
                      {outUnits > 0 && (
                        <span className="text-destructive font-medium">−{outUnits} units</span>
                      )}
                    </div>
                  </div>
                  {items.map((r) => {
                    const meta = TYPE_META[r.movement_type];
                    const Icon = meta.icon;
                    const incoming = r.to_location_id === locationId;
                    // Always use the real product cost from the products catalog
                    // (movement.unit_cost may store the price paid by the supply store).
                    const cost = Number(r.product?.cost_usd ?? 0);
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
                    const imgs = r.product?.product_images ?? [];
                    const sortedImgs = [...imgs].sort(
                      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
                    );
                    const thumb = r.product?.image_url || sortedImgs[0]?.image_url || null;
                    return (
                      <div key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            className="h-10 w-10 rounded object-cover flex-shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex-shrink-0 flex items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">
                              {r.product?.name ?? "—"}
                            </span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 gap-1">
                              <Icon className={`h-2.5 w-2.5 ${meta.tone}`} />
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
                                  storePrice - cost >= 0 ? "text-emerald-500" : "text-destructive"
                                }
                              >
                                Profit ${(storePrice - cost).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="text-right">
                            <div
                              className={`font-semibold text-sm ${
                                incoming ? "text-emerald-500" : "text-destructive"
                              }`}
                            >
                              {incoming ? "+" : "−"}
                              {r.quantity}
                            </div>
                            <div className="text-[10px] text-muted-foreground">units</div>
                          </div>
                          {isSupplyStore && incoming && (r.movement_type === "receive" || r.movement_type === "transfer" || r.movement_type === "initial") && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border"
                              onClick={() => setConfirmDelete(r)}
                              aria-label="Return units to main warehouse"
                              title="Return units to main warehouse"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
              })}

            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return units to main warehouse?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  This will remove the remaining available units from this store and move them back to the default warehouse.
                  <br />
                  <br />
                  If some units were already sold, only the units still on hand will be removed.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) handleDeleteReceive(confirmDelete);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Returning..." : "Return units"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
