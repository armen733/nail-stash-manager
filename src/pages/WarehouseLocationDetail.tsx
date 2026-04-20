import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Warehouse, Package, Truck, Store } from "lucide-react";
import { toast } from "sonner";

type LocationType = "warehouse" | "fba" | "consignment" | "driver";

interface StockLocation {
  id: string;
  name: string;
  type: LocationType;
  is_active: boolean;
  is_default: boolean;
  notes: string | null;
}

interface StockRow {
  product_id: string;
  quantity: number;
  reserved: number;
  product: {
    name: string;
    sku: string;
    price_usd: number;
    cost_usd: number | null;
    reorder_level: number | null;
    image_url: string | null;
  };
}

const TYPE_ICON = {
  warehouse: Warehouse,
  fba: Package,
  driver: Truck,
  consignment: Store,
};

export default function WarehouseLocationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [location, setLocation] = useState<StockLocation | null>(null);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [locRes, stockRes] = await Promise.all([
        supabase.from("stock_locations").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("product_stock")
          .select(
            "product_id, quantity, reserved, product:products(name, sku, price_usd, cost_usd, reorder_level, image_url)"
          )
          .eq("location_id", id)
          .gt("quantity", 0)
          .order("quantity", { ascending: false }),
      ]);

      if (locRes.error) toast.error(locRes.error.message);
      setLocation((locRes.data ?? null) as StockLocation | null);
      setRows((stockRes.data ?? []) as any);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading…</div>;
  }
  if (!location) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">Location not found.</p>
        <Button onClick={() => navigate("/warehouse")}>Back to Warehouse</Button>
      </div>
    );
  }

  const Icon = TYPE_ICON[location.type];
  const totalUnits = rows.reduce((s, r) => s + r.quantity, 0);
  const totalCost = rows.reduce((s, r) => {
    const v = r.product.cost_usd && Number(r.product.cost_usd) > 0
      ? Number(r.product.cost_usd)
      : Number(r.product.price_usd);
    return s + r.quantity * v;
  }, 0);
  const totalRetail = rows.reduce(
    (s, r) => s + r.quantity * Number(r.product.price_usd ?? 0),
    0
  );

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate("/warehouse")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-md bg-primary/10 text-primary flex-shrink-0">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold truncate">{location.name}</h1>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">{location.type}</Badge>
            {location.is_default && <Badge variant="outline" className="text-xs">Default</Badge>}
            {!location.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-[10px] text-muted-foreground uppercase">Units</div>
          <div className="text-xl font-bold">{totalUnits.toLocaleString()}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-[10px] text-muted-foreground uppercase">SKUs</div>
          <div className="text-xl font-bold">{rows.length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-[10px] text-muted-foreground uppercase">Cost value</div>
          <div className="text-xl font-bold">${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-[10px] text-muted-foreground uppercase">Retail value</div>
          <div className="text-xl font-bold text-primary">${totalRetail.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No stock at this location yet.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => {
                const low = r.product.reorder_level && r.quantity <= r.product.reorder_level;
                return (
                  <div key={r.product_id} className="flex items-center gap-3 p-3">
                    {r.product.image_url ? (
                      <img src={r.product.image_url} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" loading="lazy" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.product.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.product.sku}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`font-semibold text-sm ${low ? "text-destructive" : ""}`}>
                        {r.quantity}
                      </div>
                      {r.reserved > 0 && (
                        <div className="text-[10px] text-muted-foreground">{r.reserved} reserved</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Receive / Transfer / Adjust actions coming next.
      </p>
    </div>
  );
}
