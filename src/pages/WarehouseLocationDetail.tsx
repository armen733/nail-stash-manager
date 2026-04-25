import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Warehouse,
  Package,
  Truck,
  Store,
  PackagePlus,
  ArrowLeftRight,
  ClipboardEdit,
  ShoppingCart,
  Pencil,
  MapPin,
  Navigation,
} from "lucide-react";
import { toast } from "sonner";
import { StockActionDialog, type StockAction } from "@/components/warehouse/StockActionDialog";
import { ExportMenu } from "@/components/warehouse/ExportMenu";
import { LocationPricingTab } from "@/components/warehouse/LocationPricingTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import amazonLogoFull from "@/assets/amazon-logo-full.png";

type LocationType = "warehouse" | "fba" | "consignment" | "driver";

interface StockLocation {
  id: string;
  name: string;
  type: LocationType;
  is_active: boolean;
  is_default: boolean;
  notes: string | null;
  supply_store_id: string | null;
  salon_id: string | null;
}

interface LinkedSupplyStore {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
}

interface StockRow {
  product_id: string;
  quantity: number;
  reserved: number;
  override_price: number | null;
  product: {
    name: string;
    sku: string;
    price_usd: number;
    cost_usd: number | null;
    reorder_level: number | null;
    image_url: string | null;
    product_images?: { image_url: string; display_order: number | null }[];
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
  const [supplyStore, setSupplyStore] = useState<LinkedSupplyStore | null>(null);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [otherLocations, setOtherLocations] = useState<
    { id: string; name: string; type: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const [action, setAction] = useState<StockAction | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [locRes, stockRes, allLocRes, overrideRes] = await Promise.all([
      supabase.from("stock_locations").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("product_stock")
        .select(
          "product_id, quantity, reserved, product:products(name, sku, price_usd, cost_usd, reorder_level, image_url, product_images(image_url, display_order))"
        )
        .eq("location_id", id)
        .gt("quantity", 0)
        .order("quantity", { ascending: false }),
      supabase
        .from("stock_locations")
        .select("id, name, type, is_active")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("location_product_prices")
        .select("product_id, price_usd")
        .eq("location_id", id),
    ]);

    if (locRes.error) toast.error(locRes.error.message);
    const loc = (locRes.data ?? null) as StockLocation | null;
    setLocation(loc);

    // If consignment is linked to a supply store, fetch its address/coords for quick actions.
    if (loc?.supply_store_id) {
      const { data: storeData } = await supabase
        .from("supply_stores")
        .select("id, name, address, city, latitude, longitude, phone")
        .eq("id", loc.supply_store_id)
        .maybeSingle();
      setSupplyStore((storeData ?? null) as LinkedSupplyStore | null);
    } else {
      setSupplyStore(null);
    }

    const overrideMap = new Map<string, number>();
    ((overrideRes.data ?? []) as any[]).forEach((r) =>
      overrideMap.set(r.product_id, Number(r.price_usd ?? 0))
    );
    const stockRows = ((stockRes.data ?? []) as any[]).map((r) => ({
      ...r,
      override_price: overrideMap.has(r.product_id) ? overrideMap.get(r.product_id)! : null,
    }));
    setRows(stockRows as StockRow[]);
    setOtherLocations(
      ((allLocRes.data ?? []) as any[]).filter((l) => l.id !== id).map((l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Retail value uses per-location override if set, falling back to product default.
  const totalRetail = rows.reduce(
    (s, r) =>
      s + r.quantity * Number(r.override_price ?? r.product.price_usd ?? 0),
    0
  );

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-20 md:pb-0">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/warehouse")} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <ExportMenu locationId={location?.id} scopeName={location?.name} />
      </div>

      <div className="flex items-start gap-3">
        {location.type === "fba" ? (
          <div className="px-2 py-1.5 rounded-md bg-white border flex-shrink-0 flex items-center justify-center">
            <img src={amazonLogoFull} alt="Amazon" className="h-7 w-auto object-contain" loading="lazy" />
          </div>
        ) : (
          <div className="p-2.5 rounded-md bg-primary/10 text-primary flex-shrink-0">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold truncate">{location.name}</h1>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">{location.type}</Badge>
            {location.is_default && <Badge variant="outline" className="text-xs">Default</Badge>}
            {!location.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
          </div>
        </div>
      </div>

      {/* Linked supply store: edit + directions */}
      {supplyStore && (
        <Card>
          <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <MapPin className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{supplyStore.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {supplyStore.address || supplyStore.city || "No address on file"}
                  {supplyStore.latitude === null || supplyStore.longitude === null ? (
                    <span className="ml-2 text-destructive">· Location missing</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/supply-stores/${supplyStore.id}`)}
                className="min-h-[40px]"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit store
              </Button>
              {supplyStore.latitude !== null && supplyStore.longitude !== null && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                    const q = `${supplyStore.latitude},${supplyStore.longitude}`;
                    const url = isIOS
                      ? `maps://maps.apple.com/?daddr=${q}`
                      : `https://maps.google.com/?daddr=${q}`;
                    window.open(url, "_blank");
                  }}
                  className="min-h-[40px]"
                >
                  <Navigation className="h-3.5 w-3.5 mr-1.5" /> Directions
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Button onClick={() => setAction("receive")} className="h-auto py-2.5 flex-col gap-1">
          <PackagePlus className="h-4 w-4" />
          <span className="text-xs">Receive</span>
        </Button>
        <Button
          onClick={() => setAction("sale")}
          variant="secondary"
          className="h-auto py-2.5 flex-col gap-1"
          disabled={rows.length === 0}
        >
          <ShoppingCart className="h-4 w-4" />
          <span className="text-xs">Record sale</span>
        </Button>
        <Button
          onClick={() => setAction("transfer")}
          variant="outline"
          className="h-auto py-2.5 flex-col gap-1"
          disabled={rows.length === 0 || otherLocations.length === 0}
        >
          <ArrowLeftRight className="h-4 w-4" />
          <span className="text-xs">Transfer</span>
        </Button>
        <Button
          onClick={() => setAction("adjust")}
          variant="outline"
          className="h-auto py-2.5 flex-col gap-1"
        >
          <ClipboardEdit className="h-4 w-4" />
          <span className="text-xs">Adjust</span>
        </Button>
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

      <Tabs defaultValue="stock" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-3">
          <Card>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    No stock at this location yet.
                  </p>
                  <Button size="sm" onClick={() => setAction("receive")}>
                    <PackagePlus className="h-4 w-4 mr-1" /> Receive your first stock
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {rows.map((r) => {
                    const low = r.product.reorder_level && r.quantity <= r.product.reorder_level;
                    const imgs = r.product.product_images ?? [];
                    const sorted = [...imgs].sort(
                      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
                    );
                    const thumb = r.product.image_url || sorted[0]?.image_url || null;
                    const effectivePrice = r.override_price ?? Number(r.product.price_usd ?? 0);
                    const hasOverride = r.override_price !== null;
                    return (
                      <div key={r.product_id} className="flex items-center gap-3 p-3">
                        {thumb ? (
                          <img src={thumb} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" loading="lazy" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{r.product.name}</div>
                          <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                            <span>{r.product.sku}</span>
                            <span>·</span>
                            <span className={hasOverride ? "text-primary font-medium" : ""}>
                              ${effectivePrice.toFixed(2)}
                            </span>
                            {hasOverride && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1">
                                Custom
                              </Badge>
                            )}
                          </div>
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
        </TabsContent>

        <TabsContent value="pricing" className="mt-3">
          <LocationPricingTab locationId={location.id} />
        </TabsContent>
      </Tabs>

      {action && (
        <StockActionDialog
          open={!!action}
          onOpenChange={(v) => !v && setAction(null)}
          action={action}
          locationId={location.id}
          locationName={location.name}
          otherLocations={otherLocations}
          onDone={load}
        />
      )}
    </div>
  );
}
