import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Save, RotateCcw, TrendingUp, TrendingDown } from "lucide-react";
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
  overridePrice: number | null;
  stockHere: number;
  draft: string; // input field value
  saving: boolean;
}

export function LocationPricingTab({ locationId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "in_stock" | "overridden">("in_stock");

  const load = async () => {
    setLoading(true);
    // First fetch the location to discover if it's tied to a supply store
    const { data: locRow } = await supabase
      .from("stock_locations")
      .select("id, type, supply_store_id")
      .eq("id", locationId)
      .maybeSingle();

    const supplyStoreId =
      locRow?.type === "consignment" ? locRow?.supply_store_id ?? null : null;

    const [prodRes, stockRes, overrideRes, storeRes, discountOverridesRes] =
      await Promise.all([
        supabase
          .from("products")
          .select("id, name, sku, cost_usd, price_usd, wholesale_price_usd")
          .order("name")
          .limit(5000),
        supabase
          .from("product_stock")
          .select("product_id, quantity")
          .eq("location_id", locationId),
        supabase
          .from("location_product_prices")
          .select("product_id, price_usd")
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
    const overrideMap = new Map<string, number>();
    (overrideRes.data ?? []).forEach((r: any) =>
      overrideMap.set(r.product_id, Number(r.price_usd ?? 0))
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
      const override = overrideMap.has(p.id) ? overrideMap.get(p.id)! : null;
      const defaultPrice = Number(p.price_usd ?? 0);
      const hasExplicitWholesale = p.wholesale_price_usd != null;
      const wholesalePrice = hasExplicitWholesale
        ? Number(p.wholesale_price_usd)
        : defaultPrice;
      const discountPct = discountOverrideMap.has(p.id)
        ? discountOverrideMap.get(p.id)!
        : defaultDiscountPct;
      // Only compute "store pays us" when this is a supply store AND we have a real wholesale price
      const ourSalePrice = supplyStoreId && hasExplicitWholesale
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
        overridePrice: override,
        stockHere: stockMap.get(p.id) ?? 0,
        draft: override !== null ? String(override) : "",
        saving: false,
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
    if (filter === "overridden") list = list.filter((r) => r.overridePrice !== null);
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 200);
  }, [rows, search, filter]);

  const updateDraft = (pid: string, v: string) => {
    setRows((prev) =>
      prev.map((r) => (r.product_id === pid ? { ...r, draft: v.replace(/[^0-9.]/g, "") } : r))
    );
  };

  const saveOverride = async (row: Row) => {
    const v = row.draft.trim();
    if (v === "") {
      // Empty -> remove override
      await removeOverride(row);
      return;
    }
    const num = Number(v);
    if (!Number.isFinite(num) || num < 0) {
      toast.error("Enter a valid price");
      return;
    }
    setRows((p) =>
      p.map((r) => (r.product_id === row.product_id ? { ...r, saving: true } : r))
    );
    const { error } = await supabase.from("location_product_prices").upsert(
      {
        location_id: locationId,
        product_id: row.product_id,
        price_usd: num,
      },
      { onConflict: "location_id,product_id" }
    );
    setRows((p) =>
      p.map((r) =>
        r.product_id === row.product_id
          ? { ...r, saving: false, overridePrice: error ? r.overridePrice : num }
          : r
      )
    );
    if (error) toast.error(error.message);
    else toast.success(`Price set for ${row.name}`);
  };

  const removeOverride = async (row: Row) => {
    setRows((p) =>
      p.map((r) => (r.product_id === row.product_id ? { ...r, saving: true } : r))
    );
    const { error } = await supabase
      .from("location_product_prices")
      .delete()
      .eq("location_id", locationId)
      .eq("product_id", row.product_id);
    setRows((p) =>
      p.map((r) =>
        r.product_id === row.product_id
          ? {
              ...r,
              saving: false,
              overridePrice: error ? r.overridePrice : null,
              draft: error ? r.draft : "",
            }
          : r
      )
    );
    if (error) toast.error(error.message);
    else toast.info(`Reverted to default for ${row.name}`);
  };

  const overriddenCount = rows.filter((r) => r.overridePrice !== null).length;

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
            variant={filter === "overridden" ? "default" : "outline"}
            onClick={() => setFilter("overridden")}
            className="h-9 text-xs"
          >
            Custom ({overriddenCount})
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
            const effective = r.overridePrice ?? r.defaultPrice;
            const margin = effective > 0 && r.cost > 0 ? ((effective - r.cost) / effective) * 100 : null;
            const diffVsDefault =
              r.overridePrice !== null && r.defaultPrice > 0
                ? ((r.overridePrice - r.defaultPrice) / r.defaultPrice) * 100
                : 0;
            const hasWholesale = r.ourSalePrice > 0;
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

                {/* Price grid: clear labels, no overlap */}
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
                      {hasWholesale ? `$${r.ourSalePrice.toFixed(2)}` : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                    <div className="text-muted-foreground leading-none">Retail</div>
                    <div className="mt-1 font-semibold text-foreground">
                      ${r.defaultPrice.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Override row: label + input + reset */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-muted-foreground leading-tight">
                      Custom price for this location
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {margin !== null && (
                        <span
                          className={`text-[11px] font-medium ${
                            margin >= 30
                              ? "text-emerald-600"
                              : margin >= 10
                              ? "text-foreground"
                              : "text-destructive"
                          }`}
                        >
                          {margin.toFixed(0)}% margin
                        </span>
                      )}
                      {r.overridePrice !== null && diffVsDefault !== 0 && (
                        <span
                          className={`text-[10px] flex items-center gap-0.5 ${
                            diffVsDefault > 0 ? "text-emerald-600" : "text-destructive"
                          }`}
                        >
                          {diffVsDefault > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {diffVsDefault > 0 ? "+" : ""}
                          {diffVsDefault.toFixed(0)}% vs default
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="relative flex-shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      $
                    </span>
                    <Input
                      inputMode="decimal"
                      placeholder={r.defaultPrice.toFixed(2)}
                      value={r.draft}
                      onChange={(e) => updateDraft(r.product_id, e.target.value)}
                      onBlur={() => {
                        const cur = r.overridePrice !== null ? String(r.overridePrice) : "";
                        if (r.draft !== cur) saveOverride(r);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="h-9 w-24 pl-5 text-right text-sm"
                      disabled={r.saving}
                    />
                  </div>

                  {r.overridePrice !== null ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={() => removeOverride(r)}
                      disabled={r.saving}
                      title="Reset to default"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <div className="w-9 flex-shrink-0" />
                  )}

                  {r.saving && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                  )}
                </div>
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
