import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, TrendingUp, TrendingDown, DollarSign, Package } from "lucide-react";

interface Props {
  locationId: string;
  supplyStoreId?: string | null;
  /** Store-level default markup % the store applies on top of our retail. */
  storeMarkupPercent?: number;
  /** Period filter: "all" or "YYYY-MM". */
  period?: string;
}

interface ProductRow {
  product_id: string;
  name: string;
  sku: string;
  // Potential — based on all delivered units at suggested retail
  potentialUnits: number;
  potentialRevenue: number;
  potentialCost: number;
  potentialProfit: number;
  potentialMarginPct: number;
  // Actual — based on recorded sales only
  soldUnits: number;
  soldRevenue: number;
  soldCost: number;
  soldProfit: number;
  soldMarginPct: number;
  avgRetailPrice: number; // suggested retail
  avgWholesalePrice: number;
  avgSoldPrice: number; // actual avg sold price
}

const formatMoney = (n: number) => {
  const abs = Math.abs(n);
  const digits = abs > 0 && abs < 1000 ? 2 : 0;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

export function LocationFinancialsTab({ locationId, supplyStoreId = null, storeMarkupPercent = 0, period = "all" }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"profit" | "units" | "margin" | "revenue">(
    "profit"
  );

  const load = async () => {
    setLoading(true);
    // Build optional date range for period filter ("YYYY-MM" → that calendar month).
    let startISO: string | null = null;
    let endISO: string | null = null;
    if (period && period !== "all") {
      const [yStr, mStr] = period.split("-");
      const y = Number(yStr);
      const m = Number(mStr) - 1;
      startISO = new Date(y, m, 1).toISOString();
      endISO = new Date(y, m + 1, 1).toISOString();
    }
    // Stock IN to store (what we delivered) — store paid us this (wholesale)
    let inQuery = supabase
      .from("stock_movements")
      .select("product_id, quantity, unit_cost, movement_type")
      .eq("to_location_id", locationId);
    if (startISO && endISO) inQuery = inQuery.gte("created_at", startISO).lt("created_at", endISO);
    const { data: moves } = await inQuery;

    // Stock OUT — includes both transfers/returns back to warehouse AND actual sales to customers
    let outQuery = supabase
      .from("stock_movements")
      .select("product_id, quantity, unit_cost, movement_type")
      .eq("from_location_id", locationId);
    if (startISO && endISO) outQuery = outQuery.gte("created_at", startISO).lt("created_at", endISO);
    const { data: outMoves } = await outQuery;

    const ins = (moves ?? []) as any[];
    const outsAll = (outMoves ?? []) as any[];
    // Split outs: actual customer sales vs returns/transfers back to warehouse
    const sales = outsAll.filter((m) => m.movement_type === "sale");
    const outs = outsAll.filter((m) => m.movement_type !== "sale");
    const allPids = Array.from(
      new Set([...ins, ...outsAll].map((m) => m.product_id))
    );

    // Get product info — we need retail price (price_usd) as fallback
    // for store's selling price to customers
    const productMap = new Map<
      string,
      { name: string; sku: string; retailPrice: number }
    >();
    if (allPids.length > 0) {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, sku, price_usd")
        .in("id", allPids);
      ((prods ?? []) as any[]).forEach((p) => {
        productMap.set(p.id, {
          name: p.name,
          sku: p.sku,
          retailPrice: Number(p.price_usd ?? 0),
        });
      });
    }

    // Per-product markup % overrides for this supply store (if any).
    // Suggested retail = our list price × (1 + markup%).
    const markupOverrideMap = new Map<string, number>();
    if (supplyStoreId && allPids.length > 0) {
      const { data: ssp } = await supabase
        .from("supply_store_products")
        .select("product_id, markup_percent_override")
        .eq("supply_store_id", supplyStoreId)
        .in("product_id", allPids);
      ((ssp ?? []) as any[]).forEach((row) => {
        if (row.markup_percent_override != null) {
          markupOverrideMap.set(row.product_id, Number(row.markup_percent_override));
        }
      });
    }

    type Acc = {
      unitsIn: number;
      unitsOut: number;
      paidIn: number;
      paidOut: number;
      unitsSoldReal: number;
      saleRevenueReal: number;
    };
    const acc = new Map<string, Acc>();
    const get = (pid: string): Acc => {
      let a = acc.get(pid);
      if (!a) {
        a = { unitsIn: 0, unitsOut: 0, paidIn: 0, paidOut: 0, unitsSoldReal: 0, saleRevenueReal: 0 };
        acc.set(pid, a);
      }
      return a;
    };
    for (const m of ins) {
      const a = get(m.product_id);
      const qty = Number(m.quantity ?? 0);
      a.unitsIn += qty;
      a.paidIn += qty * Number(m.unit_cost ?? 0);
    }
    for (const m of outs) {
      const a = get(m.product_id);
      const qty = Number(m.quantity ?? 0);
      a.unitsOut += qty;
      a.paidOut += qty * Number(m.unit_cost ?? 0);
    }
    for (const m of sales) {
      const a = get(m.product_id);
      const qty = Number(m.quantity ?? 0);
      a.unitsSoldReal += qty;
      // For sale movements, unit_cost stores the actual sale price (see StockActionDialog)
      a.saleRevenueReal += qty * Number(m.unit_cost ?? 0);
    }

    const result: ProductRow[] = [];
    for (const [pid, a] of acc) {
      const info = productMap.get(pid);
      if (!info) continue;
      const netDelivered = a.unitsIn - a.unitsOut;
      const markupPct = markupOverrideMap.get(pid) ?? storeMarkupPercent ?? 0;
      const suggestedRetail =
        markupPct > 0 ? info.retailPrice * (1 + markupPct / 100) : info.retailPrice;
      const avgWholesalePrice = a.unitsIn > 0 ? a.paidIn / a.unitsIn : 0;

      // Potential — if all delivered units sell at suggested retail
      const potentialUnits = Math.max(0, netDelivered);
      const potentialRevenue = potentialUnits * suggestedRetail;
      const potentialCost = potentialUnits * avgWholesalePrice;
      const potentialProfit = potentialRevenue - potentialCost;
      const potentialMarginPct =
        potentialCost > 0 ? (potentialProfit / potentialCost) * 100 : 0;

      // Actual — recorded sales only
      const soldUnits = a.unitsSoldReal;
      const soldRevenue = a.saleRevenueReal;
      const soldCost = soldUnits * avgWholesalePrice;
      const soldProfit = soldRevenue - soldCost;
      const soldMarginPct = soldCost > 0 ? (soldProfit / soldCost) * 100 : 0;
      const avgSoldPrice = soldUnits > 0 ? soldRevenue / soldUnits : 0;

      // Skip products with neither potential nor real sales
      if (potentialUnits <= 0 && soldUnits <= 0) continue;

      result.push({
        product_id: pid,
        name: info.name,
        sku: info.sku,
        potentialUnits,
        potentialRevenue,
        potentialCost,
        potentialProfit,
        potentialMarginPct,
        soldUnits,
        soldRevenue,
        soldCost,
        soldProfit,
        soldMarginPct,
        avgRetailPrice: suggestedRetail,
        avgWholesalePrice,
        avgSoldPrice,
      });
    }
    setRows(result);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, period]);

  const totals = useMemo(() => {
    let potentialUnits = 0;
    let potentialRevenue = 0;
    let potentialCost = 0;
    let soldUnits = 0;
    let soldRevenue = 0;
    let soldCost = 0;
    rows.forEach((r) => {
      potentialUnits += r.potentialUnits;
      potentialRevenue += r.potentialRevenue;
      potentialCost += r.potentialCost;
      soldUnits += r.soldUnits;
      soldRevenue += r.soldRevenue;
      soldCost += r.soldCost;
    });
    const potentialProfit = potentialRevenue - potentialCost;
    const potentialMargin =
      potentialCost > 0 ? (potentialProfit / potentialCost) * 100 : 0;
    const soldProfit = soldRevenue - soldCost;
    const soldMargin = soldCost > 0 ? (soldProfit / soldCost) * 100 : 0;
    return {
      potentialUnits,
      potentialRevenue,
      potentialCost,
      potentialProfit,
      potentialMargin,
      soldUnits,
      soldRevenue,
      soldCost,
      soldProfit,
      soldMargin,
      skus: rows.length,
    };
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "units":
          return b.potentialUnits - a.potentialUnits;
        case "margin":
          return b.potentialMarginPct - a.potentialMarginPct;
        case "revenue":
          return b.potentialRevenue - a.potentialRevenue;
        case "profit":
        default:
          return b.potentialProfit - a.potentialProfit;
      }
    });
    return list;
  }, [rows, search, sortBy]);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Loading financials…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm border rounded-md">
        {period && period !== "all" ? "No deliveries in this period." : "No deliveries to this store yet."}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Expected (potential) section */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Expected (all delivered units)
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Expected revenue
              </div>
              <div className="text-xl font-bold text-primary">
                {formatMoney(totals.potentialRevenue)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                suggested retail × delivered
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Store expense
              </div>
              <div className="text-xl font-bold">
                {formatMoney(totals.potentialCost)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                what they paid us (wholesale)
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Clean profit
              </div>
              <div
                className={`text-xl font-bold ${totals.potentialProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}
              >
                {formatMoney(totals.potentialProfit)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                if all sells at suggested
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] text-muted-foreground uppercase">
                Profit margin
              </div>
              <div
                className={`text-xl font-bold ${totals.potentialProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}
              >
                {totals.potentialMargin.toFixed(0)}%
              </div>
              <div className="text-[10px] text-muted-foreground">
                {totals.potentialUnits.toLocaleString()} units · {totals.skus} SKUs
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actual (recorded sales) section */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Actual (recorded sales)
        </div>
        {totals.soldUnits === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-xs border rounded-md">
            No sales recorded yet for this {period && period !== "all" ? "period" : "store"}.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Sold revenue
                </div>
                <div className="text-xl font-bold text-primary">
                  {formatMoney(totals.soldRevenue)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {totals.soldUnits.toLocaleString()} units sold
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" /> Sold expense
                </div>
                <div className="text-xl font-bold">
                  {formatMoney(totals.soldCost)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  wholesale of sold units
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Clean profit
                </div>
                <div
                  className={`text-xl font-bold ${totals.soldProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}
                >
                  {formatMoney(totals.soldProfit)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  on recorded sales
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-[10px] text-muted-foreground uppercase">
                  Profit margin
                </div>
                <div
                  className={`text-xl font-bold ${totals.soldProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}
                >
                  {totals.soldMargin.toFixed(0)}%
                </div>
                <div className="text-[10px] text-muted-foreground">
                  on recorded sales
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Per-product breakdown */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Package className="h-4 w-4" /> Earnings by product
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {visible.length}
          </Badge>
        </div>

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
          <div className="flex gap-1 overflow-x-auto">
            {(
              [
                ["profit", "Profit"],
                ["revenue", "Revenue"],
                ["units", "Units"],
                ["margin", "Margin"],
              ] as const
            ).map(([k, label]) => (
              <Button
                key={k}
                size="sm"
                variant={sortBy === k ? "default" : "outline"}
                onClick={() => setSortBy(k)}
                className="h-9 text-xs whitespace-nowrap"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="border rounded-md divide-y">
          {visible.map((r) => (
            <div key={r.product_id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-tight truncate">
                    {r.name}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground font-mono">
                    {r.sku}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div
                    className={`text-sm font-bold ${r.potentialProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}
                  >
                    {formatMoney(r.potentialProfit)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.potentialMarginPct.toFixed(0)}% expected margin
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-muted-foreground leading-none">Delivered</div>
                  <div className="mt-1 font-semibold">{r.potentialUnits}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    suggested ${r.avgRetailPrice.toFixed(2)}/u
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-muted-foreground leading-none">
                    Expected revenue
                  </div>
                  <div className="mt-1 font-semibold text-primary">
                    {formatMoney(r.potentialRevenue)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    if all sells
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-muted-foreground leading-none">Expense</div>
                  <div className="mt-1 font-semibold">
                    {formatMoney(r.potentialCost)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    paid us ${r.avgWholesalePrice.toFixed(2)}/u
                  </div>
                </div>
              </div>

              {r.soldUnits > 0 && (
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5">
                    <div className="text-muted-foreground leading-none">Sold</div>
                    <div className="mt-1 font-semibold text-emerald-500">
                      {r.soldUnits}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      avg ${r.avgSoldPrice.toFixed(2)}/u
                    </div>
                  </div>
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5">
                    <div className="text-muted-foreground leading-none">
                      Sold revenue
                    </div>
                    <div className="mt-1 font-semibold text-emerald-500">
                      {formatMoney(r.soldRevenue)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      actual
                    </div>
                  </div>
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5">
                    <div className="text-muted-foreground leading-none">
                      Sold profit
                    </div>
                    <div
                      className={`mt-1 font-semibold ${r.soldProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}
                    >
                      {formatMoney(r.soldProfit)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {r.soldMarginPct.toFixed(0)}% margin
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {visible.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No products match.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
