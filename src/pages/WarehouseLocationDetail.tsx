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
  FileSpreadsheet,
  Phone,
  Mail,
  MapPin,
  Globe,
  Instagram,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { StockActionDialog, type StockAction } from "@/components/warehouse/StockActionDialog";
import { ExportMenu } from "@/components/warehouse/ExportMenu";
import { LocationPricingTab } from "@/components/warehouse/LocationPricingTab";
import { LocationHistoryTab } from "@/components/warehouse/LocationHistoryTab";
import { PricingSheetExportDialog } from "@/components/supply-stores/PricingSheetExportDialog";
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
}

interface StockRow {
  product_id: string;
  quantity: number;
  reserved: number;
  override_price: number | null;
  /** What we sell this unit for at THIS location (supply store discount applied, or per-location override). */
  effective_unit_price: number;
  /** Suggested resell price the store should charge (markup % over our regular price). */
  suggested_resell_unit_price: number;
  product: {
    name: string;
    sku: string;
    price_usd: number;
    wholesale_price_usd: number | null;
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
  const [rows, setRows] = useState<StockRow[]>([]);
  const [otherLocations, setOtherLocations] = useState<
    { id: string; name: string; type: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [storeDefaults, setStoreDefaults] = useState<{ discount: number; markup: number } | null>(null);
  const [storeInfo, setStoreInfo] = useState<{
    id: string;
    name: string;
    status: string | null;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    instagram: string | null;
    city: string | null;
    address: string | null;
    notes: string | null;
    logo_url: string | null;
  } | null>(null);
  const [pricingSheetOpen, setPricingSheetOpen] = useState(false);

  const [action, setAction] = useState<StockAction | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [locRes, stockRes, allLocRes, overrideRes] = await Promise.all([
      supabase.from("stock_locations").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("product_stock")
        .select(
          "product_id, quantity, reserved, product:products(name, sku, price_usd, wholesale_price_usd, cost_usd, reorder_level, image_url, product_images(image_url, display_order))"
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

    let storeDiscount = 0;
    let storeMarkup = 0;
    const productDiscountOverrides = new Map<string, number>();
    const productMarkupOverrides = new Map<string, number>();

    if (loc?.type === "consignment" && loc.supply_store_id) {
      const [{ data: storeData }, { data: ssp }] = await Promise.all([
        supabase
          .from("supply_stores")
          .select(
            "id, name, status, contact_name, phone, email, website, instagram, city, address, notes, logo_url, default_discount_percent, default_markup_percent",
          )
          .eq("id", loc.supply_store_id)
          .maybeSingle(),
        supabase
          .from("supply_store_products")
          .select("product_id, discount_percent_override, markup_percent_override")
          .eq("supply_store_id", loc.supply_store_id),
      ]);
      if (storeData) {
        storeDiscount = Number(storeData.default_discount_percent ?? 0);
        storeMarkup = Number(storeData.default_markup_percent ?? 0);
        setStoreDefaults({ discount: storeDiscount, markup: storeMarkup });
        setStoreInfo({
          id: storeData.id,
          name: storeData.name,
          status: storeData.status ?? null,
          contact_name: storeData.contact_name ?? null,
          phone: storeData.phone ?? null,
          email: storeData.email ?? null,
          website: storeData.website ?? null,
          instagram: storeData.instagram ?? null,
          city: storeData.city ?? null,
          address: storeData.address ?? null,
          notes: storeData.notes ?? null,
          logo_url: (storeData as any).logo_url ?? null,
        });
      } else {
        setStoreDefaults(null);
        setStoreInfo(null);
      }
      ((ssp ?? []) as any[]).forEach((r) => {
        if (r.discount_percent_override != null) {
          productDiscountOverrides.set(r.product_id, Number(r.discount_percent_override));
        }
        if (r.markup_percent_override != null) {
          productMarkupOverrides.set(r.product_id, Number(r.markup_percent_override));
        }
      });
    } else {
      setStoreDefaults(null);
      setStoreInfo(null);
    }

    const overrideMap = new Map<string, number>();
    ((overrideRes.data ?? []) as any[]).forEach((r) =>
      overrideMap.set(r.product_id, Number(r.price_usd ?? 0))
    );

    const isSupply = loc?.type === "consignment" && !!loc.supply_store_id;
    const stockRows = ((stockRes.data ?? []) as any[]).map((r) => {
      const product = r.product ?? {};
      const retail = Number(product.price_usd ?? 0);
      const wholesale = Number(product.wholesale_price_usd ?? product.price_usd ?? 0);
      // Effective unit price = what we charge at THIS location.
      // Priority: per-location explicit price override > supply-store discount > regular retail.
      let effective = retail;
      if (overrideMap.has(r.product_id)) {
        effective = overrideMap.get(r.product_id)!;
      } else if (isSupply) {
        const discountPct = productDiscountOverrides.has(r.product_id)
          ? productDiscountOverrides.get(r.product_id)!
          : storeDiscount;
        effective = wholesale * (1 - discountPct / 100);
      }
      // Suggested resell = what the store should sell at (markup applied to our regular price).
      let suggestedResell = retail;
      if (isSupply) {
        const markupPct = productMarkupOverrides.has(r.product_id)
          ? productMarkupOverrides.get(r.product_id)!
          : storeMarkup;
        suggestedResell = markupPct > 0 ? retail * (1 + markupPct / 100) : retail;
      }
      return {
        ...r,
        override_price: overrideMap.has(r.product_id) ? overrideMap.get(r.product_id)! : null,
        effective_unit_price: effective,
        suggested_resell_unit_price: suggestedResell,
      };
    });
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
  // "Sale value" = what we'd be paid for these units at this location's effective price
  // (per-location override > supply-store discount > regular retail).
  const totalRetail = rows.reduce(
    (s, r) => s + r.quantity * Number(r.effective_unit_price ?? 0),
    0
  );
  const isSupplyStoreView = location?.type === "consignment" && !!location.supply_store_id;
  // Supply-store-only earnings projections on current on-hand stock.
  const ourProfit = isSupplyStoreView
    ? rows.reduce((s, r) => {
        const cost =
          r.product.cost_usd && Number(r.product.cost_usd) > 0
            ? Number(r.product.cost_usd)
            : 0;
        return s + r.quantity * (Number(r.effective_unit_price ?? 0) - cost);
      }, 0)
    : 0;
  const storeEarns = isSupplyStoreView
    ? rows.reduce(
        (s, r) =>
          s +
          r.quantity *
            (Number(r.suggested_resell_unit_price ?? 0) - Number(r.effective_unit_price ?? 0)),
        0,
      )
    : 0;
  const profitMarginPct = totalCost > 0 ? (ourProfit / totalCost) * 100 : 0;
  // Show cents for small totals so users see the real number; round larger totals.
  const formatMoney = (n: number) => {
    const abs = Math.abs(n);
    const digits = abs > 0 && abs < 1000 ? 2 : 0;
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-20 md:pb-0">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/warehouse")} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPricingSheetOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Pricing sheet
          </Button>
          <ExportMenu locationId={location?.id} scopeName={location?.name} />
        </div>
      </div>

      <div className="flex items-start gap-3">
        {location.type === "fba" ? (
          <div className="px-2 py-1.5 rounded-md bg-white border flex-shrink-0 flex items-center justify-center">
            <img src={amazonLogoFull} alt="Amazon" className="h-7 w-auto object-contain" loading="lazy" />
          </div>
        ) : storeInfo?.logo_url ? (
          <div className="h-12 w-12 rounded-md border bg-white flex-shrink-0 flex items-center justify-center overflow-hidden">
            <img
              src={storeInfo.logo_url}
              alt={storeInfo.name}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="p-2.5 rounded-md bg-primary/10 text-primary flex-shrink-0">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold truncate">{location.name}</h1>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">{location.type === "consignment" ? "supply store" : location.type}</Badge>
            {location.is_default && <Badge variant="outline" className="text-xs">Default</Badge>}
            {!location.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
          </div>
        </div>
      </div>

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

      <div
        className={`grid gap-2 grid-cols-2 ${isSupplyStoreView ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-4"}`}
      >
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
          <div className="text-xl font-bold">{formatMoney(totalCost)}</div>
          <div className="text-[10px] text-muted-foreground">what these cost us</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-[10px] text-muted-foreground uppercase">
            {isSupplyStoreView ? "Store paid us" : "Retail value"}
          </div>
          <div className="text-xl font-bold text-primary">{formatMoney(totalRetail)}</div>
          {isSupplyStoreView && (
            <div className="text-[10px] text-muted-foreground">total they owe / paid</div>
          )}
        </CardContent></Card>
        {isSupplyStoreView && (
          <>
            <Card><CardContent className="pt-4 pb-3">
              <div className="text-[10px] text-muted-foreground uppercase">Clean profit</div>
              <div
                className={`text-xl font-bold ${ourProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}
              >
                {formatMoney(ourProfit)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                paid − cost ({profitMarginPct.toFixed(0)}%)
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3">
              <div className="text-[10px] text-muted-foreground uppercase">Store earns</div>
              <div className="text-xl font-bold text-primary">
                {formatMoney(storeEarns)}
              </div>
              <div className="text-[10px] text-muted-foreground">if sold at suggested</div>
            </CardContent></Card>
          </>
        )}
      </div>

      {storeInfo && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Store className="h-4 w-4 text-primary" /> {storeInfo.name}
                  {storeInfo.status && (
                    <Badge
                      variant={storeInfo.status === "active" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {storeInfo.status}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                  {storeInfo.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {storeInfo.city}
                    </span>
                  )}
                  {storeInfo.contact_name && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {storeInfo.contact_name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Contact actions — clickable */}
            <div className="flex flex-wrap gap-2">
              {storeInfo.phone && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${storeInfo.phone}`}>
                    <Phone className="h-3.5 w-3.5 mr-1.5" />
                    {storeInfo.phone}
                  </a>
                </Button>
              )}
              {storeInfo.email && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:${storeInfo.email}`}>
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    Email
                  </a>
                </Button>
              )}
              {storeInfo.website && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={storeInfo.website.startsWith("http") ? storeInfo.website : `https://${storeInfo.website}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Globe className="h-3.5 w-3.5 mr-1.5" />
                    Website
                  </a>
                </Button>
              )}
              {storeInfo.instagram && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`https://instagram.com/${storeInfo.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Instagram className="h-3.5 w-3.5 mr-1.5" />
                    @{storeInfo.instagram.replace(/^@/, "")}
                  </a>
                </Button>
              )}
              {storeInfo.address && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const encoded = encodeURIComponent(storeInfo.address!);
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                    window.open(
                      isIOS
                        ? `maps://maps.apple.com/?q=${encoded}`
                        : `https://maps.google.com/?q=${encoded}`,
                      "_blank",
                    );
                  }}
                >
                  <MapPin className="h-3.5 w-3.5 mr-1.5" />
                  Directions
                </Button>
              )}
            </div>

            {/* Notes */}
            {storeInfo.notes && (
              <div className="space-y-2 pt-1 border-t border-border">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Notes</div>
                  <div className="text-sm whitespace-pre-wrap">{storeInfo.notes}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="stock" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
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
                    const effectivePrice = Number(r.effective_unit_price ?? 0);
                    const hasOverride = r.override_price !== null;
                    const cost =
                      r.product.cost_usd && Number(r.product.cost_usd) > 0
                        ? Number(r.product.cost_usd)
                        : 0;
                    const unitProfit = effectivePrice - cost;
                    const lineProfit = unitProfit * r.quantity;
                    const profitPct = cost > 0 ? (unitProfit / cost) * 100 : 0;
                    const showProfit = isSupplyStoreView && cost > 0;
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
                          {showProfit && (
                            <div className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span
                                className={
                                  unitProfit >= 0 ? "text-emerald-500 font-medium" : "text-destructive font-medium"
                                }
                              >
                                +${unitProfit.toFixed(2)}/unit
                              </span>
                              <span className="text-muted-foreground">
                                ({profitPct.toFixed(0)}%)
                              </span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">
                                ${lineProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} total
                              </span>
                            </div>
                          )}
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

        <TabsContent value="history" className="mt-3">
          <LocationHistoryTab
            locationId={location.id}
            storeDiscountPercent={storeDefaults?.discount ?? 0}
            storeMarkupPercent={storeDefaults?.markup ?? 0}
            isSupplyStore={location.type === "consignment"}
            onStockChanged={load}
          />
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
          locationType={location.type}
          storeDiscountPercent={storeDefaults?.discount ?? 0}
          storeMarkupPercent={storeDefaults?.markup ?? 0}
          supplyStoreId={location.supply_store_id ?? null}
          otherLocations={otherLocations}
          onDone={load}
        />
      )}

      <PricingSheetExportDialog
        open={pricingSheetOpen}
        onOpenChange={setPricingSheetOpen}
        scopeName={location.name}
        defaultDiscount={storeDefaults?.discount ?? 0}
        defaultMarkup={storeDefaults?.markup ?? 0}
        preselectedProductIds={rows.map((r) => r.product_id)}
        storeInfo={
          storeInfo
            ? {
                name: storeInfo.name,
                contact_name: storeInfo.contact_name,
                phone: storeInfo.phone,
                email: storeInfo.email,
                address: storeInfo.address,
              }
            : undefined
        }
      />
    </div>
  );
}
