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
}

interface ProductRow {
  product_id: string;
  name: string;
  sku: string;
  unitsSold: number;
  storeRevenue: number; // what store earns selling to customers (retail × units)
  storeCost: number; // what store paid us (wholesale)
  profit: number; // storeRevenue - storeCost
  marginPct: number;
  avgRetailPrice: number;
  avgWholesalePrice: number;
}

const formatMoney = (n: number) => {
  const abs = Math.abs(n);
  const digits = abs > 0 && abs < 1000 ? 2 : 0;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

export function LocationFinancialsTab({ locationId, supplyStoreId = null, storeMarkupPercent = 0 }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"profit" | "units" | "margin" | "revenue">(
    "profit"
  );

  const load = async () => {
    setLoading(true);
    // Stock IN to store (what we delivered) — store paid us this
    const { data: moves } = await supabase
      .from("stock_movements")
      .select("product_id, quantity, unit_cost")
      .eq("to_location_id", locationId);

    // Stock OUT (returns to warehouse, etc.)
    const { data: outMoves } = await supabase
      .from("stock_movements")
      .select("product_id, quantity, unit_cost")
      .eq("from_location_id", locationId);

    const ins = (moves ?? []) as any[];
    const outs = (outMoves ?? []) as any[];
    const allPids = Array.from(
      new Set([...ins, ...outs].map((m) => m.product_id))
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
    };
    const acc = new Map<string, Acc>();
    const get = (pid: string): Acc => {
      let a = acc.get(pid);
      if (!a) {
        a = { unitsIn: 0, unitsOut: 0, paidIn: 0, paidOut: 0 };
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

    const result: ProductRow[] = [];
    for (const [pid, a] of acc) {
      const info = productMap.get(pid);
      if (!info) continue;
      const unitsSold = a.unitsIn - a.unitsOut;
      if (unitsSold <= 0) continue;
      const storeCost = a.paidIn - a.paidOut; // what store paid us (their expense)
      // Suggested retail = our list price × (1 + markup%); fall back to list price if no markup.
      const markupPct = markupOverrideMap.get(pid) ?? storeMarkupPercent ?? 0;
      const suggestedRetail =
        markupPct > 0 ? info.retailPrice * (1 + markupPct / 100) : info.retailPrice;
      const storeRevenue = unitsSold * suggestedRetail; // store earns at suggested retail
      const profit = storeRevenue - storeCost;
      const marginPct = storeCost > 0 ? (profit / storeCost) * 100 : 0;
      const avgWholesalePrice = unitsSold > 0 ? storeCost / unitsSold : 0;
      result.push({
        product_id: pid,
        name: info.name,
        sku: info.sku,
        unitsSold,
        storeRevenue,
        storeCost,
        profit,
        marginPct,
        avgRetailPrice: suggestedRetail,
        avgWholesalePrice,
      });
    }
    setRows(result);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const totals = useMemo(() => {
    let units = 0;
    let revenue = 0;
    let cost = 0;
    rows.forEach((r) => {
      units += r.unitsSold;
      revenue += r.storeRevenue;
      cost += r.storeCost;
    });
    const profit = revenue - cost;
    const margin = cost > 0 ? (profit / cost) * 100 : 0;
    return { units, revenue, cost, profit, margin, skus: rows.length };
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
          return b.unitsSold - a.unitsSold;
        case "margin":
          return b.marginPct - a.marginPct;
        case "revenue":
          return b.storeRevenue - a.storeRevenue;
        case "profit":
        default:
          return b.profit - a.profit;
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
        No deliveries to this store yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top KPI cards */}
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> Store revenue
            </div>
            <div className="text-xl font-bold text-primary">
              {formatMoney(totals.revenue)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              suggested retail × units
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Store expenses
            </div>
            <div className="text-xl font-bold">{formatMoney(totals.cost)}</div>
            <div className="text-[10px] text-muted-foreground">
              what they paid us (wholesale)
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Store profit
            </div>
            <div
              className={`text-xl font-bold ${totals.profit >= 0 ? "text-emerald-500" : "text-destructive"}`}
            >
              {formatMoney(totals.profit)}
            </div>
            <div className="text-[10px] text-muted-foreground">revenue − expenses</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-[10px] text-muted-foreground uppercase">
              Profit margin
            </div>
            <div
              className={`text-xl font-bold ${totals.profit >= 0 ? "text-emerald-500" : "text-destructive"}`}
            >
              {totals.margin.toFixed(0)}%
            </div>
            <div className="text-[10px] text-muted-foreground">
              {totals.units.toLocaleString()} units · {totals.skus} SKUs
            </div>
          </CardContent>
        </Card>
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
                    className={`text-sm font-bold ${r.profit >= 0 ? "text-emerald-500" : "text-destructive"}`}
                  >
                    {formatMoney(r.profit)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.marginPct.toFixed(0)}% margin
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-muted-foreground leading-none">Units sold</div>
                  <div className="mt-1 font-semibold">{r.unitsSold}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    suggested ${r.avgRetailPrice.toFixed(2)}/u
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-muted-foreground leading-none">Revenue</div>
                  <div className="mt-1 font-semibold text-primary">
                    {formatMoney(r.storeRevenue)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    store earns
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-muted-foreground leading-none">Expense</div>
                  <div className="mt-1 font-semibold">{formatMoney(r.storeCost)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    paid us ${r.avgWholesalePrice.toFixed(2)}/u
                  </div>
                </div>
              </div>
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
