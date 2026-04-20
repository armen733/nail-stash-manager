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
    const [prodRes, stockRes, overrideRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, sku, cost_usd, price_usd")
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

    const next: Row[] = (prodRes.data ?? []).map((p: any) => {
      const override = overrideMap.has(p.id) ? overrideMap.get(p.id)! : null;
      const defaultPrice = Number(p.price_usd ?? 0);
      return {
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        cost: Number(p.cost_usd ?? 0),
        defaultPrice,
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
            return (
              <div
                key={r.product_id}
                className="p-2 sm:p-3 flex flex-col sm:flex-row sm:items-center gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-2 flex-wrap">
                    <span>{r.sku}</span>
                    <span>·</span>
                    <span>Default ${r.defaultPrice.toFixed(2)}</span>
                    {r.cost > 0 && (
                      <>
                        <span>·</span>
                        <span>Cost ${r.cost.toFixed(2)}</span>
                      </>
                    )}
                    {r.stockHere > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {r.stockHere} on hand
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    {margin !== null && (
                      <div
                        className={`text-[11px] font-medium ${
                          margin >= 30
                            ? "text-emerald-600"
                            : margin >= 10
                            ? "text-foreground"
                            : "text-destructive"
                        }`}
                      >
                        {margin.toFixed(0)}% margin
                      </div>
                    )}
                    {r.overridePrice !== null && diffVsDefault !== 0 && (
                      <div
                        className={`text-[10px] flex items-center justify-end gap-0.5 ${
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
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
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
                    <div className="w-9" />
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
