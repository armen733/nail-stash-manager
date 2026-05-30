import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Minus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit-log";

export type StockAction = "receive" | "transfer" | "adjust" | "sale";

interface LocationOption {
  id: string;
  name: string;
  type: string;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  cost_usd: number | null;
  /** Product's real registered list/retail price (always from products.price_usd) */
  price_usd: number;
  /** Optional per-location sell-price override (what we previously charged this location) */
  location_price_override: number | null;
  wholesale_price_usd: number | null;
  image_url: string | null;
  stockHere: number;
}

interface LineItem {
  product_id: string;
  name: string;
  sku: string;
  stockHere: number;
  quantity: string;
  unit_cost: string;
  unit_price: string;
  default_price: number;
  /** Our cost per unit — used to compute profit on consignment receive */
  product_cost: number | null;
  /** Wholesale baseline used to compute the suggested store sell price */
  wholesale_baseline: number | null;
  /** Per-line discount % off our list price (consignment receive only) */
  discount_pct: string;
  /** Per-line suggested markup % the store applies on top of OUR LIST price (consignment receive only) */
  markup_pct: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: StockAction;
  locationId: string;
  locationName: string;
  /** Type of the location we're acting on (warehouse | fba | consignment | driver) */
  locationType?: string;
  /** Default % discount this supply store gets off wholesale price */
  storeDiscountPercent?: number;
  /** Default % markup the store should apply on top of OUR LIST price */
  storeMarkupPercent?: number;
  /** The supply_store_id (if locationType is consignment) so we can persist overrides */
  supplyStoreId?: string | null;
  /** For transfer: the OTHER locations to choose from */
  otherLocations?: LocationOption[];
  onDone: () => void;
}

const ACTION_META: Record<StockAction, { title: string; verb: string; submit: string }> = {
  receive: {
    title: "Receive stock",
    verb: "Add new units into",
    submit: "Receive",
  },
  transfer: {
    title: "Transfer stock",
    verb: "Move units out of",
    submit: "Transfer",
  },
  adjust: {
    title: "Adjust stock",
    verb: "Correct on-hand counts at",
    submit: "Save adjustment",
  },
  sale: {
    title: "Record sale",
    verb: "Log units sold from",
    submit: "Record sale",
  },
};

export function StockActionDialog({
  open,
  onOpenChange,
  action,
  locationId,
  locationName,
  locationType,
  storeDiscountPercent = 0,
  storeMarkupPercent = 0,
  supplyStoreId = null,
  otherLocations = [],
  onDone,
}: Props) {
  const meta = ACTION_META[action];
  const isConsignmentReceive = action === "receive" && locationType === "consignment";
  const isConsignmentSale = action === "sale" && locationType === "consignment";

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);
  const [reason, setReason] = useState("");
  const [destLocationId, setDestLocationId] = useState("");
  const [saving, setSaving] = useState(false);
  // Per-product saved overrides for this supply store, used to seed lines
  const [discountOverrideMap, setDiscountOverrideMap] = useState<Map<string, number>>(new Map());
  const [markupOverrideMap, setMarkupOverrideMap] = useState<Map<string, number>>(new Map());
  // For consignment receive: pick which warehouse the stock comes FROM.
  // Defaults to the first warehouse-type location available.
  const [sourceLocationId, setSourceLocationId] = useState("");
  // Stock available at the chosen source, per product, for validation + display.
  const [sourceStockMap, setSourceStockMap] = useState<Map<string, number>>(new Map());

  // Warehouse-type locations available as a default source for "give stock to supply store"
  const sourceCandidates = useMemo(
    () => otherLocations.filter((l) => l.type === "warehouse"),
    [otherLocations],
  );

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setLines([]);
    setReason("");
    setDestLocationId("");
    setSourceStockMap(new Map());
    // Default source: first warehouse if any, else first other location
    if (isConsignmentReceive) {
      const def = sourceCandidates[0]?.id ?? otherLocations[0]?.id ?? "";
      setSourceLocationId(def);
    } else {
      setSourceLocationId("");
    }
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When source changes (consignment receive only), load that source's stock per product.
  useEffect(() => {
    if (!isConsignmentReceive || !sourceLocationId) {
      setSourceStockMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_stock")
        .select("product_id, quantity")
        .eq("location_id", sourceLocationId);
      if (cancelled) return;
      const m = new Map<string, number>();
      ((data ?? []) as any[]).forEach((r) => m.set(r.product_id, Number(r.quantity ?? 0)));
      setSourceStockMap(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceLocationId, isConsignmentReceive]);

  const loadProducts = async () => {
    setLoadingProducts(true);
    // Fetch products + stock at this location + per-location price overrides + (if consignment) per-product discount/markup overrides.
    const [prodRes, stockRes, overrideRes, sspRes] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, name, sku, cost_usd, price_usd, wholesale_price_usd, image_url, product_images(image_url, display_order)"
        )
        .order("name")
        .limit(2000),
      supabase
        .from("product_stock")
        .select("product_id, quantity")
        .eq("location_id", locationId),
      supabase
        .from("location_product_prices")
        .select("product_id, price_usd")
        .eq("location_id", locationId),
      (isConsignmentReceive || isConsignmentSale) && supplyStoreId
        ? supabase
            .from("supply_store_products")
            .select("product_id, discount_percent_override, markup_percent_override")
            .eq("supply_store_id", supplyStoreId)
        : Promise.resolve({ data: [] as any[] } as any),
    ]);

    if (prodRes.error) {
      toast.error(prodRes.error.message);
      setLoadingProducts(false);
      return;
    }
    const stockMap = new Map<string, number>();
    (stockRes.data ?? []).forEach((r: any) => stockMap.set(r.product_id, Number(r.quantity ?? 0)));
    const overrideMap = new Map<string, number>();
    (overrideRes.data ?? []).forEach((r: any) =>
      overrideMap.set(r.product_id, Number(r.price_usd ?? 0))
    );
    const dMap = new Map<string, number>();
    const mMap = new Map<string, number>();
    (((sspRes as any)?.data ?? []) as any[]).forEach((r) => {
      if (r.discount_percent_override != null) dMap.set(r.product_id, Number(r.discount_percent_override));
      if (r.markup_percent_override != null) mMap.set(r.product_id, Number(r.markup_percent_override));
    });
    setDiscountOverrideMap(dMap);
    setMarkupOverrideMap(mMap);

    const rows: ProductRow[] = (prodRes.data ?? []).map((p: any) => {
      const sorted = [...(p.product_images ?? [])].sort(
        (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)
      );
      const thumb = p.image_url || sorted[0]?.image_url || null;
      // Always use the product's real list price for markup math.
      const listPrice = Number(p.price_usd ?? 0);
      const override = overrideMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        cost_usd: p.cost_usd,
        price_usd: listPrice,
        location_price_override: override != null ? Number(override) : null,
        wholesale_price_usd: p.wholesale_price_usd != null ? Number(p.wholesale_price_usd) : null,
        image_url: thumb,
        stockHere: stockMap.get(p.id) ?? 0,
      };
    });
    setProducts(rows);
    setLoadingProducts(false);
  };

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products;
    if (action !== "receive") {
      list = list.filter((p) => p.stockHere > 0);
    }
    if (q) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 50);
  }, [products, search, action]);

  const addLine = (p: ProductRow) => {
    if (lines.find((l) => l.product_id === p.id)) {
      toast.info("Already in list");
      return;
    }
    // For consignment receive, derive sell price from per-product override → store default discount.
    const list = p.price_usd; // product's real list/retail price
    const wholesale = p.wholesale_price_usd ?? p.price_usd;
    const savedDiscount = discountOverrideMap.get(p.id);
    const savedMarkup = markupOverrideMap.get(p.id);
    const effectiveDiscount = isConsignmentReceive
      ? savedDiscount ?? storeDiscountPercent ?? 0
      : 0;
    const effectiveMarkup =
      isConsignmentReceive || isConsignmentSale
        ? savedMarkup ?? storeMarkupPercent ?? 0
        : 0;
    // Prefer an explicit per-location sell-price override only when no discount % is saved,
    // otherwise compute from list * (1 - discount%) so list price drives the math.
    const suggestedStorePrice = isConsignmentReceive
      ? savedDiscount == null && p.location_price_override != null
        ? p.location_price_override
        : Math.max(0, list * (1 - effectiveDiscount / 100))
      : null;
    // For consignment SALE: pre-fill the unit price with the suggested retail
    // (list × (1 + markup%)), matching what we showed during stock-giving.
    const suggestedRetailForSale = isConsignmentSale
      ? Math.max(0, list * (1 + effectiveMarkup / 100))
      : null;
    setLines((prev) => [
      ...prev,
      {
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        stockHere: p.stockHere,
        quantity: "1",
        unit_cost:
          suggestedStorePrice != null
            ? suggestedStorePrice.toFixed(2)
            : p.cost_usd
            ? String(p.cost_usd)
            : "",
        unit_price:
          suggestedRetailForSale != null
            ? suggestedRetailForSale.toFixed(2)
            : p.price_usd
            ? String(p.price_usd)
            : "",
        default_price: p.price_usd,
        product_cost: p.cost_usd != null ? Number(p.cost_usd) : null,
        wholesale_baseline: wholesale || null,
        discount_pct: isConsignmentReceive ? String(effectiveDiscount) : "",
        markup_pct:
          isConsignmentReceive || isConsignmentSale ? String(effectiveMarkup) : "",
      },
    ]);
  };

  const updateLine = (id: string, patch: Partial<LineItem>) => {
    setLines((prev) => prev.map((l) => (l.product_id === id ? { ...l, ...patch } : l)));
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.product_id !== id));
  };

  const handleSubmit = async () => {
    if (lines.length === 0) {
      toast.error("Add at least one product");
      return;
    }
    if (action === "transfer" && !destLocationId) {
      toast.error("Pick a destination location");
      return;
    }
    if (isConsignmentReceive && !sourceLocationId) {
      toast.error("Pick where the stock comes from");
      return;
    }

    // Validate quantities
    const movements: any[] = [];
    for (const l of lines) {
      const qtyNum = Number(l.quantity);
      if (action === "adjust") {
        // Adjust: quantity is the NEW on-hand value, allow 0+
        if (!Number.isFinite(qtyNum) || qtyNum < 0) {
          toast.error(`Invalid quantity for ${l.name}`);
          return;
        }
        const delta = qtyNum - l.stockHere;
        if (delta === 0) continue; // skip no-ops
        const unitCost = l.unit_cost ? Number(l.unit_cost) : null;
        movements.push({
          product_id: l.product_id,
          movement_type: "adjustment",
          quantity: Math.abs(delta),
          from_location_id: delta < 0 ? locationId : null,
          to_location_id: delta > 0 ? locationId : null,
          unit_cost: unitCost,
          reason: reason.trim() || "Manual adjustment",
        });
      } else if (action === "receive") {
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          toast.error(`Invalid quantity for ${l.name}`);
          return;
        }
        const unitCost = l.unit_cost ? Number(l.unit_cost) : null;
        // For consignment receive (give stock to a supply store), deduct from the chosen
        // source warehouse so we have a real paper trail of where the stock came from.
        if (isConsignmentReceive && sourceLocationId) {
          const available = sourceStockMap.get(l.product_id) ?? 0;
          if (qtyNum > available) {
            const srcName =
              otherLocations.find((o) => o.id === sourceLocationId)?.name ?? "source";
            toast.warning(`Low stock: only ${available} of ${l.name} at ${srcName}, proceeding anyway`);
          }
        }
        movements.push({
          product_id: l.product_id,
          movement_type: isConsignmentReceive && sourceLocationId ? "transfer" : "receive",
          quantity: qtyNum,
          from_location_id: isConsignmentReceive && sourceLocationId ? sourceLocationId : null,
          to_location_id: locationId,
          unit_cost: unitCost,
          reason: reason.trim() || null,
        });
      } else if (action === "sale") {
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          toast.error(`Invalid quantity for ${l.name}`);
          return;
        }
        if (qtyNum > l.stockHere) {
          toast.error(`Only ${l.stockHere} available for ${l.name}`);
          return;
        }
        const priceNum = l.unit_price ? Number(l.unit_price) : l.default_price;
        movements.push({
          product_id: l.product_id,
          movement_type: "sale",
          quantity: qtyNum,
          from_location_id: locationId,
          to_location_id: null,
          unit_cost: Number.isFinite(priceNum) ? priceNum : null,
          reason: reason.trim() || "Manual sale",
          reference_type: "manual_sale",
        });
      } else {
        // transfer
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          toast.error(`Invalid quantity for ${l.name}`);
          return;
        }
        if (qtyNum > l.stockHere) {
          toast.warning(`Low stock: only ${l.stockHere} of ${l.name} here, proceeding anyway`);
        }
        movements.push({
          product_id: l.product_id,
          movement_type: "transfer",
          quantity: qtyNum,
          from_location_id: locationId,
          to_location_id: destLocationId,
          unit_cost: l.unit_cost ? Number(l.unit_cost) : null,
          reason: reason.trim() || null,
        });
      }
    }

    if (movements.length === 0) {
      toast.info("Nothing to save");
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    const payload = movements.map((m) => ({ ...m, created_by: userId }));

    const { error } = await supabase.from("stock_movements").insert(payload);

    // For consignment receives: persist per-store sell prices so analytics & history match.
    if (!error && isConsignmentReceive) {
      const priceRows = lines
        .filter((l) => Number(l.unit_cost) > 0)
        .map((l) => ({
          location_id: locationId,
          product_id: l.product_id,
          price_usd: Number(l.unit_cost),
        }));
      if (priceRows.length > 0) {
        await supabase
          .from("location_product_prices")
          .upsert(priceRows, { onConflict: "location_id,product_id" });
      }

      // Persist per-product discount % and markup % overrides for this supply store
      // so the History/Stock stats and pricing sheets all use the same numbers.
      if (supplyStoreId) {
        const sspRows = lines
          .filter(
            (l) =>
              (l.discount_pct !== "" && Number.isFinite(Number(l.discount_pct))) ||
              (l.markup_pct !== "" && Number.isFinite(Number(l.markup_pct))),
          )
          .map((l) => ({
            supply_store_id: supplyStoreId,
            product_id: l.product_id,
            discount_percent_override:
              l.discount_pct !== "" ? Number(l.discount_pct) : null,
            markup_percent_override:
              l.markup_pct !== "" ? Number(l.markup_pct) : null,
          }));
        if (sspRows.length > 0) {
          await supabase
            .from("supply_store_products")
            .upsert(sspRows, { onConflict: "supply_store_id,product_id" });
        }
      }
    }
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    // Audit log: one entry summarizing the whole batch
    const totalUnits = movements.reduce((s, m) => s + Number(m.quantity), 0);
    const destName = action === "transfer"
      ? otherLocations.find((l) => l.id === destLocationId)?.name ?? "another location"
      : null;
    await logAudit({
      action: action === "sale" ? "other" : (action === "receive" ? "create" : "update"),
      entityType: "stock",
      entityLabel: locationName,
      summary:
        action === "transfer"
          ? `Transferred ${totalUnits} units from ${locationName} → ${destName} (${movements.length} products)`
          : action === "receive"
          ? `Received ${totalUnits} units into ${locationName} (${movements.length} products)`
          : action === "sale"
          ? `Recorded sale of ${totalUnits} units from ${locationName} (${movements.length} products)`
          : `Adjusted stock at ${locationName} (${movements.length} products)`,
      metadata: {
        action,
        location_id: locationId,
        location_name: locationName,
        destination_location_id: destLocationId || null,
        destination_location_name: destName,
        total_units: totalUnits,
        line_count: movements.length,
        reason: reason.trim() || null,
      },
    });

    toast.success(
      `${meta.submit} complete (${movements.length} ${movements.length === 1 ? "item" : "items"})`
    );
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isConsignmentReceive ? "Give stock to supply store" : meta.title}
          </DialogTitle>
          <DialogDescription>
            {isConsignmentReceive ? (
              <>
                Send units to{" "}
                <span className="font-medium text-foreground">{locationName}</span> at a
                discounted store price. We track your profit per unit.
              </>
            ) : (
              <>
                {meta.verb}{" "}
                <span className="font-medium text-foreground">{locationName}</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 -mx-1 px-1">
          {action === "transfer" && (
            <div className="space-y-1.5">
              <Label>Destination location</Label>
              <Select value={destLocationId} onValueChange={setDestLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick where stock goes…" />
                </SelectTrigger>
                <SelectContent>
                  {otherLocations.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      No other active locations.
                    </div>
                  ) : (
                    otherLocations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}{" "}
                        <span className="text-xs text-muted-foreground ml-1">({l.type})</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {isConsignmentReceive && (
            <div className="space-y-1.5">
              <Label>Stock comes from</Label>
              <Select value={sourceLocationId} onValueChange={setSourceLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a warehouse…" />
                </SelectTrigger>
                <SelectContent>
                  {otherLocations.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      No other active locations.
                    </div>
                  ) : (
                    otherLocations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}{" "}
                        <span className="text-xs text-muted-foreground ml-1">({l.type})</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Units will be deducted from this location and the supply store's history will show where they came from.
              </p>
            </div>
          )}

          {/* Product picker */}
          <div className="space-y-2">
            <Label>Add products</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={
                  action === "receive"
                    ? "Search any product…"
                    : "Search products in this location…"
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            {/* Always show the product list so users can browse without searching */}
            <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
              {loadingProducts ? (
                <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : visibleProducts.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  {action === "receive"
                    ? "No products match your search."
                    : search
                    ? "No matches in this location."
                    : "No products with stock at this location yet."}
                </div>
              ) : (
                <>
                  {visibleProducts.map((p) => {
                    const added = lines.some((l) => l.product_id === p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addLine(p)}
                        disabled={added}
                        className="w-full flex items-center gap-2 p-2 hover:bg-accent text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt=""
                            className="h-8 w-8 rounded object-cover flex-shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{p.sku}</div>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {isConsignmentReceive
                            ? `${sourceStockMap.get(p.id) ?? 0} at source`
                            : `${p.stockHere} here`}
                        </Badge>
                        {added ? (
                          <Badge variant="outline" className="text-[10px] flex-shrink-0">
                            Added
                          </Badge>
                        ) : (
                          <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                  {!search && visibleProducts.length >= 50 && (
                    <div className="p-2 text-[11px] text-center text-muted-foreground bg-muted/30">
                      Showing first 50 — search to find more.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Selected lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {action === "adjust" ? "Set new on-hand quantity" : "Items"} ({lines.length})
              </Label>
              {lines.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setLines([])}
                  className="h-7 text-xs"
                >
                  Clear all
                </Button>
              )}
            </div>
            {lines.length === 0 ? (
              <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
                No products added yet. Search above to add some.
              </div>
            ) : (
              <div className="border rounded-md divide-y">
                {lines.map((l) => (
                  <div key={l.product_id} className="p-2 sm:p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{l.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {l.sku} · {l.stockHere} on hand
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 flex-shrink-0"
                        onClick={() => removeLine(l.product_id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">
                          {action === "adjust" ? "New qty" : "Quantity"}
                        </Label>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 flex-shrink-0"
                            onClick={() => {
                              const n = Math.max(0, Number(l.quantity || 0) - 1);
                              updateLine(l.product_id, { quantity: String(n) });
                            }}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            inputMode="numeric"
                            value={l.quantity}
                            onChange={(e) =>
                              updateLine(l.product_id, {
                                quantity: e.target.value.replace(/[^0-9]/g, ""),
                              })
                            }
                            className="h-8 text-center"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 flex-shrink-0"
                            onClick={() => {
                              const n = Number(l.quantity || 0) + 1;
                              updateLine(l.product_id, { quantity: String(n) });
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground whitespace-nowrap">
                          {action === "sale"
                            ? "Unit price"
                            : isConsignmentReceive
                            ? "Sell to store ($)"
                            : "Unit cost (opt.)"}
                        </Label>
                        <Input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={action === "sale" ? l.unit_price : l.unit_cost}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9.]/g, "");
                            updateLine(
                              l.product_id,
                              action === "sale" ? { unit_price: v } : { unit_cost: v }
                            );
                          }}
                          className="h-8"
                        />
                      </div>
                    </div>
                    {isConsignmentSale && (
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground whitespace-nowrap">
                          Markup % on list (auto-fills price)
                        </Label>
                        <Input
                          inputMode="decimal"
                          placeholder="0"
                          value={l.markup_pct}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9.]/g, "");
                            const list = l.default_price || 0;
                            const pct = Number(v || 0);
                            const newPrice = Math.max(0, list * (1 + pct / 100));
                            updateLine(l.product_id, {
                              markup_pct: v,
                              unit_price: newPrice.toFixed(2),
                            });
                          }}
                          className="h-8"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          List ${(l.default_price || 0).toFixed(2)} · suggested ${(
                            (l.default_price || 0) *
                            (1 + Number(l.markup_pct || 0) / 100)
                          ).toFixed(2)}
                        </p>
                      </div>
                    )}
                    {isConsignmentReceive && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground whitespace-nowrap">
                            Discount % off list
                          </Label>
                          <Input
                            inputMode="decimal"
                            placeholder="0"
                            value={l.discount_pct}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^0-9.]/g, "");
                              const list = l.default_price || 0;
                              const pct = Number(v || 0);
                              const newSell = Math.max(0, list * (1 - pct / 100));
                              updateLine(l.product_id, {
                                discount_pct: v,
                                unit_cost: newSell.toFixed(2),
                              });
                            }}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground whitespace-nowrap">
                            Markup % on list
                          </Label>
                          <Input
                            inputMode="decimal"
                            placeholder="0"
                            value={l.markup_pct}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^0-9.]/g, "");
                              updateLine(l.product_id, { markup_pct: v });
                            }}
                            className="h-8"
                          />
                        </div>
                      </div>
                    )}
                    {action === "adjust" && (
                      <div className="text-[11px] text-muted-foreground">
                        Change: {Number(l.quantity || 0) - l.stockHere > 0 ? "+" : ""}
                        {Number(l.quantity || 0) - l.stockHere}
                      </div>
                    )}
                    {action === "sale" && (
                      <div className="text-[11px] text-muted-foreground">
                        Line total: $
                        {(
                          Number(l.quantity || 0) *
                          Number(l.unit_price || l.default_price || 0)
                        ).toFixed(2)}
                      </div>
                    )}
                    {isConsignmentReceive && (() => {
                      const qty = Number(l.quantity || 0);
                      const sell = Number(l.unit_cost || 0);
                      const cost = l.product_cost ?? 0;
                      const list = l.default_price || 0;
                      const markup = Number(l.markup_pct || 0);
                      const suggestedRetail = list * (1 + markup / 100);
                      const profitPerUnit = sell - cost;
                      const totalRevenue = sell * qty;
                      const totalProfit = profitPerUnit * qty;
                      const storeEarnPerUnit = suggestedRetail - sell;
                      const storeEarnTotal = storeEarnPerUnit * qty;
                      const margin = cost > 0 ? (profitPerUnit / cost) * 100 : 0;
                      return (
                        <div className="rounded-md bg-muted/40 p-2 text-[11px] grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <div className="text-muted-foreground">Our cost</div>
                            <div className="font-medium">${cost.toFixed(2)}/u</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Profit/unit</div>
                            <div
                              className={`font-medium ${
                                profitPerUnit < 0 ? "text-destructive" : "text-emerald-500"
                              }`}
                            >
                              ${profitPerUnit.toFixed(2)} ({margin.toFixed(0)}%)
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Store pays us</div>
                            <div className="font-medium">${totalRevenue.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Our profit</div>
                            <div
                              className={`font-medium ${
                                totalProfit < 0 ? "text-destructive" : "text-emerald-500"
                              }`}
                            >
                              ${totalProfit.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Sugg. retail</div>
                            <div className="font-medium">${suggestedRetail.toFixed(2)}/u</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Store earns</div>
                            <div className="font-medium text-primary">
                              ${storeEarnTotal.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Reason / Note (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              placeholder={
                action === "receive"
                  ? "PO #, supplier shipment…"
                  : action === "transfer"
                  ? "Why you're moving this stock…"
                  : action === "sale"
                  ? "Customer name, channel (in-person, phone)…"
                  : "Reason for adjustment (count, damage, theft…)"
              }
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || lines.length === 0}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              meta.submit
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
