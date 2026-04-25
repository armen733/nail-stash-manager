import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Package, Calendar, DollarSign, ShoppingBag } from "lucide-react";
import { format } from "date-fns";

interface Props {
  storeId: string | null;
  storeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MovementRow {
  id: string;
  created_at: string;
  quantity: number;
  unit_cost: number | null;
  reason: string | null;
  product_id: string;
  product: { name: string; sku: string; image_url: string | null; wholesale_price_usd: number | null; price_usd: number | null; cost_usd: number | null } | null;
}

interface ShipmentGroup {
  key: string; // date + reason as a rough grouping
  date: string;
  reason: string | null;
  items: { id: string; name: string; sku: string; image: string | null; quantity: number; unitRevenue: number; lineRevenue: number }[];
  totalRevenue: number;
  totalUnits: number;
}

export const SupplyStoreStockHistory = ({ storeId, storeName, open, onOpenChange }: Props) => {
  const [groups, setGroups] = useState<ShipmentGroup[]>([]);
  const [totals, setTotals] = useState({ revenue: 0, units: 0, shipments: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !storeId) return;

    const run = async () => {
      setLoading(true);
      try {
        // 1. find all stock locations linked to this supply store
        const { data: locs, error: locsErr } = await supabase
          .from("stock_locations")
          .select("id")
          .eq("supply_store_id", storeId);
        if (locsErr) throw locsErr;
        const locIds = (locs ?? []).map((l) => l.id);
        if (locIds.length === 0) {
          setGroups([]);
          setTotals({ revenue: 0, units: 0, shipments: 0 });
          return;
        }

        // 2. pull store discount + per-product overrides for revenue calc
        const [storeRes, overridesRes, movementsRes] = await Promise.all([
          supabase.from("supply_stores").select("default_discount_percent").eq("id", storeId).maybeSingle(),
          supabase.from("supply_store_products").select("product_id, discount_percent_override").eq("supply_store_id", storeId),
          supabase
            .from("stock_movements")
            .select("id, created_at, quantity, unit_cost, reason, product_id, product:products(name, sku, image_url, wholesale_price_usd, price_usd, cost_usd)")
            .in("movement_type", ["transfer", "sale", "receive"])
            .in("to_location_id", locIds)
            .order("created_at", { ascending: false })
            .limit(2000),
        ]);
        if (movementsRes.error) throw movementsRes.error;

        const storeDiscount = Number(storeRes.data?.default_discount_percent ?? 0);
        const overrideMap = new Map<string, number>();
        (overridesRes.data ?? []).forEach((o: any) => {
          if (o.discount_percent_override != null) overrideMap.set(o.product_id, Number(o.discount_percent_override));
        });

        const rows = (movementsRes.data ?? []) as unknown as MovementRow[];

        // group by day + reason (typical "shipment" grouping)
        const groupMap = new Map<string, ShipmentGroup>();
        let revTot = 0;
        let unitTot = 0;
        rows.forEach((r) => {
          const day = r.created_at.split("T")[0];
          const reason = r.reason ?? null;
          const key = `${day}__${reason ?? ""}`;
          const wholesale = Number(r.product?.wholesale_price_usd ?? r.product?.price_usd ?? 0);
          const discountPct = overrideMap.has(r.product_id) ? overrideMap.get(r.product_id)! : storeDiscount;
          const unitRevenue = wholesale * (1 - discountPct / 100);
          const lineRevenue = unitRevenue * r.quantity;
          revTot += lineRevenue;
          unitTot += r.quantity;

          if (!groupMap.has(key)) {
            groupMap.set(key, {
              key,
              date: r.created_at,
              reason,
              items: [],
              totalRevenue: 0,
              totalUnits: 0,
            });
          }
          const g = groupMap.get(key)!;
          g.items.push({
            id: r.id,
            name: r.product?.name ?? "Unknown",
            sku: r.product?.sku ?? "",
            image: r.product?.image_url ?? null,
            quantity: r.quantity,
            unitRevenue,
            lineRevenue,
          });
          g.totalRevenue += lineRevenue;
          g.totalUnits += r.quantity;
        });

        const sortedGroups = Array.from(groupMap.values()).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        setGroups(sortedGroups);
        setTotals({ revenue: revTot, units: unitTot, shipments: sortedGroups.length });
      } catch (e) {
        console.error("Failed to load supply store stock history", e);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [open, storeId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl h-[90vh] sm:h-[85vh] flex flex-col p-4 sm:p-6 gap-3">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6">
            <ShoppingBag className="h-5 w-5 text-primary flex-shrink-0" />
            <span className="truncate">{storeName}</span>
          </DialogTitle>
        </DialogHeader>

        {!loading && (
          <div className="flex flex-wrap gap-3 sm:gap-4 text-sm border-b pb-3 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Shipments:</span>
              <span className="font-semibold">{totals.shipments}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Units sent:</span>
              <span className="font-semibold">{totals.units}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Revenue:</span>
              <span className="font-semibold text-primary">${totals.revenue.toFixed(2)}</span>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 -mx-4 sm:-mx-6 px-4 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No stock has been sent to this store yet.</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {groups.map((g) => (
                <div key={g.key} className="border rounded-lg p-3 sm:p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium">{format(new Date(g.date), "MMM d, yyyy")}</span>
                      <span className="text-xs text-muted-foreground">{g.totalUnits} units</span>
                    </div>
                    <span className="font-semibold text-sm text-primary">${g.totalRevenue.toFixed(2)}</span>
                  </div>

                  <div className="space-y-1 pl-6">
                    {g.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate flex-1">
                          {item.name} × {item.quantity}
                          {item.sku && <span className="ml-1.5 text-[10px] opacity-60">({item.sku})</span>}
                        </span>
                        <span className="ml-2">${item.lineRevenue.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {g.reason && <p className="text-xs text-muted-foreground pl-6 italic">{g.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
