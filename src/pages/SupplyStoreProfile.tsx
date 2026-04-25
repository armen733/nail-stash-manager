import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Phone, Mail, MapPin, Globe, Instagram, Plus, Trash2, Download, Printer, Store, Package, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import ProductPickerDialog from "@/components/supply-stores/ProductPickerDialog";
import { PricingSheetExportDialog } from "@/components/supply-stores/PricingSheetExportDialog";
import { computePricing, effectiveDiscount, effectiveMarkup } from "@/lib/wholesale-pricing";
import { exportWholesaleCatalog } from "@/lib/wholesale-export";
import { openPrintableCatalog } from "@/lib/wholesale-catalog-print";

interface SupplyStore {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  default_discount_percent: number;
  default_markup_percent: number;
}

interface Assignment {
  id: string;
  product_id: string;
  discount_percent_override: number | null;
  markup_percent_override: number | null;
  notes: string | null;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price_usd: number;
  wholesale_price_usd: number | null;
}

interface CompanyBrand {
  company_name: string;
  logo_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  tagline: string | null;
}

export default function SupplyStoreProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store, setStore] = useState<SupplyStore | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [brand, setBrand] = useState<CompanyBrand | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pricingSheetOpen, setPricingSheetOpen] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [storeRes, assignRes, brandRes] = await Promise.all([
      supabase.from("supply_stores").select("*").eq("id", id).single(),
      supabase.from("supply_store_products").select("*").eq("supply_store_id", id),
      supabase.from("company_settings").select("*").limit(1).maybeSingle(),
    ]);
    if (storeRes.data) setStore(storeRes.data as SupplyStore);
    const a = (assignRes.data ?? []) as Assignment[];
    setAssignments(a);
    if (brandRes.data) setBrand(brandRes.data as CompanyBrand);

    const productIds = a.map((x) => x.product_id);
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, sku, category, price_usd, wholesale_price_usd")
        .in("id", productIds);
      const map = new Map<string, Product>();
      (prods ?? []).forEach((p) => map.set(p.id, p as Product));
      setProducts(map);
    } else {
      setProducts(new Map());
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.product_id)), [assignments]);

  const removeAssignment = async (a: Assignment) => {
    if (!confirm("Remove this product from the catalog?")) return;
    const { error } = await supabase.from("supply_store_products").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  };

  const updateOverride = async (
    a: Assignment,
    field: "discount_percent_override" | "markup_percent_override",
    raw: string,
  ) => {
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (Number.isNaN(value) || value < 0)) return;
    const { error } = await supabase
      .from("supply_store_products")
      .update({ [field]: value })
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, [field]: value } : x)));
  };

  const buildRows = () => {
    if (!store) return [];
    return assignments
      .map((a) => {
        const p = products.get(a.product_id);
        if (!p) return null;
        const basePrice = Number(p.wholesale_price_usd ?? p.price_usd ?? 0);
        return {
          sku: p.sku,
          name: p.name,
          category: p.category,
          basePrice,
          discountPercent: effectiveDiscount(store.default_discount_percent, a.discount_percent_override),
          markupPercent: effectiveMarkup(store.default_markup_percent, a.markup_percent_override),
        };
      })
      .filter(Boolean) as ReturnType<() => any>;
  };

  const handleExportCSV = () => {
    if (!store) return;
    const rows = buildRows();
    if (rows.length === 0) return toast.error("No products to export");
    exportWholesaleCatalog(store.name, rows);
    toast.success("Catalog exported");
  };

  const handlePrint = () => {
    if (!store) return;
    const rows = buildRows();
    if (rows.length === 0) return toast.error("No products to print");
    const safeBrand: CompanyBrand = brand ?? {
      company_name: "NÉRA Beauty",
      logo_url: null,
      contact_phone: null,
      contact_email: null,
      website: null,
      instagram: null,
      address: null,
      tagline: null,
    };
    openPrintableCatalog({ brand: safeBrand, store, rows });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Supply store not found.</p>
        <Button variant="ghost" onClick={() => navigate(-1)} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mt-0.5 flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" /> {store.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
            {store.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{store.city}</span>}
            {store.contact_name && <span>· {store.contact_name}</span>}
          </div>
        </div>
      </div>

      {/* Contact actions */}
      <div className="flex flex-wrap gap-2">
        {store.phone && (
          <Button variant="outline" size="sm" asChild>
            <a href={`tel:${store.phone}`}><Phone className="h-3.5 w-3.5 mr-1.5" />{store.phone}</a>
          </Button>
        )}
        {store.email && (
          <Button variant="outline" size="sm" asChild>
            <a href={`mailto:${store.email}`}><Mail className="h-3.5 w-3.5 mr-1.5" />Email</a>
          </Button>
        )}
        {store.website && (
          <Button variant="outline" size="sm" asChild>
            <a href={store.website.startsWith("http") ? store.website : `https://${store.website}`} target="_blank" rel="noreferrer">
              <Globe className="h-3.5 w-3.5 mr-1.5" />Website
            </a>
          </Button>
        )}
        {store.instagram && (
          <Button variant="outline" size="sm" asChild>
            <a href={`https://instagram.com/${store.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
              <Instagram className="h-3.5 w-3.5 mr-1.5" />@{store.instagram.replace(/^@/, "")}
            </a>
          </Button>
        )}
        {store.address && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const encoded = encodeURIComponent(store.address!);
              const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
              window.open(isIOS ? `maps://maps.apple.com/?q=${encoded}` : `https://maps.google.com/?q=${encoded}`, "_blank");
            }}
          >
            <MapPin className="h-3.5 w-3.5 mr-1.5" />Directions
          </Button>
        )}
      </div>

      {/* Pricing defaults */}
      <Card>
        <CardHeader className="p-3 sm:p-4">
          <CardTitle className="text-sm">Pricing defaults</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Discount off our wholesale</div>
              <div className="text-lg font-semibold">{Number(store.default_discount_percent)}%</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Suggested resale markup</div>
              <div className="text-lg font-semibold">{Number(store.default_markup_percent)}%</div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Edit these defaults via the "Edit" button on the Supply Stores list.
          </p>
        </CardContent>
      </Card>

      {/* Assigned products */}
      <Card>
        <CardHeader className="p-3 sm:p-4 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" /> Catalog ({assignments.length})
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPricingSheetOpen(true)}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Pricing sheet
            </Button>
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          {assignments.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No products yet. Tap "Add" to choose which SKUs this store carries.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 px-2">SKU</th>
                    <th className="py-2 px-2">Product</th>
                    <th className="py-2 px-2 text-right">Wholesale</th>
                    <th className="py-2 px-2 text-right">Disc %</th>
                    <th className="py-2 px-2 text-right">Cost</th>
                    <th className="py-2 px-2 text-right">Markup %</th>
                    <th className="py-2 px-2 text-right">Sugg. Retail</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => {
                    const p = products.get(a.product_id);
                    if (!p) return null;
                    const basePrice = Number(p.wholesale_price_usd ?? p.price_usd ?? 0);
                    const disc = effectiveDiscount(store.default_discount_percent, a.discount_percent_override);
                    const markup = effectiveMarkup(store.default_markup_percent, a.markup_percent_override);
                    const calc = computePricing({ basePrice, discountPercent: disc, markupPercent: markup });
                    return (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-2 px-2 font-mono text-xs">{p.sku}</td>
                        <td className="py-2 px-2">
                          <div className="font-medium truncate max-w-[200px]">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground">{p.category}</div>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">${basePrice.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={a.discount_percent_override ?? ""}
                            placeholder={String(store.default_discount_percent)}
                            onChange={(e) => updateOverride(a, "discount_percent_override", e.target.value)}
                            className="h-8 w-16 text-right text-xs px-2"
                          />
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold">${calc.storeCost.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={a.markup_percent_override ?? ""}
                            placeholder={String(store.default_markup_percent)}
                            onChange={(e) => updateOverride(a, "markup_percent_override", e.target.value)}
                            className="h-8 w-16 text-right text-xs px-2"
                          />
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">${calc.suggestedRetail.toFixed(2)}</td>
                        <td className="py-2 px-2">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeAssignment(a)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground mt-2 px-2">
                Leave a % field empty to use the store default. Filled in = per-product override.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {!brand && (
        <Card className="border-dashed">
          <CardContent className="p-3 sm:p-4 text-sm text-muted-foreground">
            Tip: set your company brand info on the Profile page so printable catalogs show your logo, website, Instagram, etc.
          </CardContent>
        </Card>
      )}

      <ProductPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        storeId={store.id}
        alreadyAssigned={assignedIds}
        onAssigned={load}
      />
    </div>
  );
}
