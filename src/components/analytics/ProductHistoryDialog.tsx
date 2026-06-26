import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Loader2, Package, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  productId: string | null;
  productName?: string;
  sku?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface HistoryRow {
  date: string;
  order_id: string;
  customer: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  profit: number;
}

export function ProductHistoryDialog({ productId, productName, sku, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [stats, setStats] = useState({ totalUnits: 0, totalRevenue: 0, totalProfit: 0, orderCount: 0, firstSold: "", lastSold: "" });
  const [stock, setStock] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !productId) return;
    (async () => {
      setLoading(true);
      const { data: prod } = await supabase
        .from("products")
        .select("stock_on_hand, cost_usd, wholesale_price_usd, sku")
        .eq("id", productId)
        .maybeSingle();
      setStock(prod?.stock_on_hand ?? null);
      const cost = (prod?.cost_usd as number) || (prod?.wholesale_price_usd as number) || 0;

      // Collect all product ids that share this SKU (siblings/variants)
      let productIds: string[] = [productId];
      const effectiveSku = sku || prod?.sku;
      if (effectiveSku) {
        const { data: sameSku } = await supabase
          .from("products")
          .select("id")
          .eq("sku", effectiveSku);
        if (sameSku && sameSku.length > 0) {
          productIds = Array.from(new Set([...productIds, ...sameSku.map((p: any) => p.id)]));
        }
      }

      const { data } = await supabase
        .from("order_items")
        .select("quantity, unit_price, line_total, orders!inner(id, created_at, customer_name, salon_name)")
        .in("product_id", productIds)
        .order("created_at", { foreignTable: "orders", ascending: false });


      const mapped: HistoryRow[] = (data || []).map((it: any) => ({
        date: it.orders?.created_at || "",
        order_id: it.orders?.id || "",
        customer: it.orders?.salon_name || it.orders?.customer_name || "—",
        quantity: it.quantity,
        unit_price: Number(it.unit_price),
        line_total: Number(it.line_total),
        profit: (Number(it.unit_price) - cost) * it.quantity,
      }));

      const totalUnits = mapped.reduce((s, r) => s + r.quantity, 0);
      const totalRevenue = mapped.reduce((s, r) => s + r.line_total, 0);
      const totalProfit = mapped.reduce((s, r) => s + r.profit, 0);
      const dates = mapped.map(r => r.date).filter(Boolean).sort();
      setStats({
        totalUnits,
        totalRevenue,
        totalProfit,
        orderCount: new Set(mapped.map(r => r.order_id)).size,
        firstSold: dates[0] || "",
        lastSold: dates[dates.length - 1] || "",
      });
      setRows(mapped);
      setLoading(false);
    })();
  }, [open, productId]);

  const margin = stats.totalRevenue > 0 ? (stats.totalProfit / stats.totalRevenue) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {productName}
            {sku && <Badge variant="outline" className="font-mono text-xs">{sku}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={<Package className="h-4 w-4" />} label="Units Sold" value={stats.totalUnits.toString()} />
              <StatCard icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={`$${stats.totalRevenue.toFixed(2)}`} color="text-primary" />
              <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Profit" value={`$${stats.totalProfit.toFixed(2)}`} sub={`${margin.toFixed(0)}% margin`} color="text-green-500" />
              <StatCard icon={<Calendar className="h-4 w-4" />} label="Orders" value={stats.orderCount.toString()} sub={stock !== null ? `${stock} in stock` : undefined} />
            </div>

            {stats.firstSold && (
              <div className="text-xs text-muted-foreground">
                First sold: {format(new Date(stats.firstSold), "MMM dd, yyyy")} · Last sold: {format(new Date(stats.lastSold), "MMM dd, yyyy")}
              </div>
            )}

            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/50 text-xs font-medium">Order History ({rows.length})</div>
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {rows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No sales yet</div>
                ) : rows.map((r, i) => (
                  <div key={i} className="px-3 py-2 flex items-center justify-between gap-2 text-sm hover:bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.customer}</div>
                      <div className="text-xs text-muted-foreground">{r.date ? format(new Date(r.date), "MMM dd, yyyy") : ""}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm">{r.quantity} × ${r.unit_price.toFixed(2)}</div>
                      <div className="text-xs text-green-500">+${r.profit.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">{icon}{label}</div>
      <div className={`text-lg font-bold ${color || ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
