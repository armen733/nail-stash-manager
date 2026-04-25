import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { toast } from "sonner";

interface Props {
  locationId: string;
}

interface Row {
  product_id: string;
  name: string;
  sku: string;
  cost: number;
  defaultPrice: number;
  wholesalePrice: number;
  ourSalePrice: number; // wholesale * (1 - discount%)
  stockHere: number;
}

export function LocationPricingTab({ locationId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "in_stock">("in_stock");

  const load = async () => {
    setLoading(true);
    const { data: locRow } = await supabase
      .from("stock_locations")
      .select("id, type, supply_store_id")
      .eq("id", locationId)
      .maybeSingle();

    const supplyStoreId =
      locRow?.type === "consignment" ? locRow?.supply_store_id ?? null : null;

    const [prodRes, stockRes, storeRes, discountOverridesRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, sku, cost_usd, price_usd, wholesale_price_usd")
        .order("name")
        .limit(5000),
      supabase
        .from("product_stock")
        .select("product_id, quantity")
        .eq("location_id", locationId),
      supplyStoreId
        ? supabase
            .from("supply_stores")
            .select("default_discount_percent")
            .eq("id", supplyStoreId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      supplyStoreId
        ? supabase
            .from("supply_store_products")
            .select("product_id, discount_percent_override")
            .eq("supply_store_id", supplyStoreId)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (prodRes.error) {
      toast.error(prodRes.error.message);
      setLoading(false);
      return;
    }

    const stockMap = new Map<string, number>();
    (stockRes.data ?? []).forEach((r: any) =>
      stockMap.set(r.product_id, Number(r.quantity ?? 0))
    );
    const defaultDiscountPct = Number(
      (storeRes as any)?.data?.default_discount_percent ?? 0
    );
    const discountOverrideMap = new Map<string, number>();
    ((discountOverridesRes as any)?.data ?? []).forEach((r: any) => {
      if (r.discount_percent_override != null) {
        discountOverrideMap.set(r.product_id, Number(r.discount_percent_override));
      }
    });

    const next: Row[] = (prodRes.data ?? []).map((p: any) => {
      const defaultPrice = Number(p.price_usd ?? 0);
      const wholesalePrice = p.wholesale_price_usd != null
        ? Number(p.wholesale_price_usd)
        : defaultPrice;
      const discountPct = discountOverrideMap.has(p.id)
        ? discountOverrideMap.get(p.id)!
        : defaultDiscountPct;
      // Always compute "store pays us" for supply stores using whatever wholesale basis we have
      const ourSalePrice = supplyStoreId
        ? wholesalePrice * (1 - discountPct / 100)
        : 0;
      return {
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        cost: Number(p.cost_usd ?? 0),
        defaultPrice,
        wholesalePrice,
        ourSalePrice,
        stockHere: stockMap.get(p.id) ?? 0,
      };
    });
    setRows(next);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (filter === "in_stock") list = list.filter((r) => r.stockHere > 0);
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 200);
  }, [rows, search, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={filter === "in_stock" ? "default" : "outline"}
            onClick={() => setFilter("in_stock")}
            className="h-9 text-xs"
          >
            In stock
          </Button>
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
            className="h-9 text-xs"
          >
            All
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading prices…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm border rounded-md">
          No products match.
        </div>
      ) : (
        <div className="border rounded-md divide-y">
          {visible.map((r) => {
            const hasWholesale = r.ourSalePrice > 0;
            const sellPrice = hasWholesale ? r.ourSalePrice : 0;
            const profit = hasWholesale && r.cost > 0 ? sellPrice - r.cost : null;
            const profitPct = profit !== null && r.cost > 0 ? (profit / r.cost) * 100 : null;
            return (
              <div key={r.product_id} className="p-3 space-y-2">
                {/* Header: name, sku, stock */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight truncate">{r.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{r.sku}</span>
                      {r.stockHere > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {r.stockHere} on hand
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Price grid: read-only */}
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                    <div className="text-muted-foreground leading-none">Our cost</div>
                    <div className="mt-1 font-semibold text-foreground">
                      {r.cost > 0 ? `$${r.cost.toFixed(2)}` : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5">
                    <div className="text-primary/80 leading-none">Store pays us</div>
                    <div className="mt-1 font-semibold text-primary">
                      {hasWholesale ? `$${sellPrice.toFixed(2)}` : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                    <div className="text-muted-foreground leading-none">Retail</div>
                    <div className="mt-1 font-semibold text-foreground">
                      ${r.defaultPrice.toFixed(2)}
                    </div>
                  </div>
                </div>

                {profit !== null && (
                  <div className="text-[11px] text-muted-foreground">
                    Profit per unit:{" "}
                    <span
                      className={`font-medium ${
                        profit >= 0 ? "text-emerald-600" : "text-destructive"
                      }`}
                    >
                      ${profit.toFixed(2)}
                      {profitPct !== null && ` (${profitPct.toFixed(0)}%)`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {!search && rows.length > 200 && (
            <div className="p-2 text-[11px] text-center text-muted-foreground bg-muted/30">
              Showing first 200 — search to find more.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
