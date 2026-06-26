import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Boxes, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

type Row = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  variant_name: string | null;
  bit_type: string | null;
  stock_on_hand: number | null;
  price_usd: number | null;
};

export function InventoryOverview() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [variant, setVariant] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const all: Row[] = [];
      const pageSize = 1000;
      let from = 0;
      // paginate to get all
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id,name,sku,category,variant_name,bit_type,stock_on_hand,price_usd")
          .order("name")
          .range(from, from + pageSize - 1);
        if (error || !data || data.length === 0) break;
        all.push(...(data as Row[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setRows(all);
      setLoading(false);
    })();
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort() as string[],
    [rows]
  );
  const variants = useMemo(() => {
    const scope = category === "all" ? rows : rows.filter((r) => r.category === category);
    const vs = scope.map((r) => r.variant_name || r.bit_type).filter(Boolean) as string[];
    return Array.from(new Set(vs)).sort();
  }, [rows, category]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (variant !== "all" && (r.variant_name || r.bit_type) !== variant) return false;
      if (q && !`${r.name} ${r.sku ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, category, variant]);

  const totals = useMemo(() => {
    const units = filtered.reduce((s, r) => s + (r.stock_on_hand || 0), 0);
    return { count: filtered.length, units };
  }, [filtered]);

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Boxes className="h-5 w-5 text-primary" />
          Inventory
          <Badge variant="outline" className="ml-2">
            {totals.count} SKUs · {totals.units} units
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={category} onValueChange={(v) => { setCategory(v); setVariant("all"); }}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={variant} onValueChange={setVariant}>
            <SelectTrigger><SelectValue placeholder="Type / Variant" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {variants.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No products</div>
        ) : (
          <ScrollArea className="h-[460px] pr-2">
            <div className="space-y-2">
              {filtered.map((r) => {
                const stock = r.stock_on_hand || 0;
                const tone =
                  stock === 0 ? "bg-red-500/5 border-red-500/20"
                  : stock < 5 ? "bg-orange-500/5 border-orange-500/20"
                  : "bg-muted/30 border-border";
                const stockTxt =
                  stock === 0 ? "text-red-500"
                  : stock < 5 ? "text-orange-500"
                  : "text-foreground";
                return (
                  <div key={r.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${tone}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {r.sku || "—"} {r.category ? `· ${r.category}` : ""} {(r.variant_name || r.bit_type) ? `· ${r.variant_name || r.bit_type}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm ${stockTxt}`}>{stock} in stock</p>
                      {r.price_usd != null && (
                        <p className="text-xs text-muted-foreground">${Number(r.price_usd).toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
