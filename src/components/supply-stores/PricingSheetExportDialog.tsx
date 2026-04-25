import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/csv-export";
import { openPrintableCatalog, type CompanyBrand } from "@/lib/wholesale-catalog-print";
import neraBeautyLogo from "@/assets/nera-beauty-logo.png";

const BRAND_EMAIL = "info@nerabeautyus.com";

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price_usd: number;
}

interface StoreInfo {
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeName?: string;
  defaultDiscount?: number;
  defaultMarkup?: number;
  preselectedProductIds?: string[];
  storeInfo?: StoreInfo;
}

export const PricingSheetExportDialog = ({
  open,
  onOpenChange,
  scopeName,
  defaultDiscount = 0,
  defaultMarkup = 0,
  preselectedProductIds,
  storeInfo,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [discount, setDiscount] = useState<number>(defaultDiscount);
  const [markup, setMarkup] = useState<number>(defaultMarkup);
  const [brand, setBrand] = useState<CompanyBrand | null>(null);

  useEffect(() => {
    if (!open) return;
    setDiscount(defaultDiscount);
    setMarkup(defaultMarkup);
    setSelected(new Set(preselectedProductIds ?? []));

    const load = async () => {
      setLoading(true);
      const [productsRes, brandRes] = await Promise.all([
        supabase.from("products").select("id, sku, name, category, price_usd").order("sku"),
        supabase
          .from("company_settings")
          .select("company_name, logo_url, contact_phone, contact_email, website, instagram, address, tagline")
          .maybeSingle(),
      ]);
      if (productsRes.error) toast.error(productsRes.error.message);
      setProducts((productsRes.data ?? []) as Product[]);
      setBrand((brandRes.data ?? null) as CompanyBrand | null);
      setLoading(false);
    };
    load();
  }, [open, defaultDiscount, defaultMarkup, preselectedProductIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [products, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allVisible = filtered.every((p) => next.has(p.id));
      if (allVisible) {
        filtered.forEach((p) => next.delete(p.id));
      } else {
        filtered.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const handleExport = () => {
    const rows = products
      .filter((p) => selected.has(p.id))
      .map((p) => {
        const ourPrice = Number(p.price_usd ?? 0);
        const wholesale = +(ourPrice * (1 - discount / 100)).toFixed(2);
        const recommended = +(ourPrice * (1 + markup / 100)).toFixed(2);
        return {
          SKU: p.sku,
          Name: p.name,
          "Our Price": ourPrice.toFixed(2),
          "Discount %": discount,
          "Wholesale Price": wholesale.toFixed(2),
          "Recommended Retail": recommended.toFixed(2),
        };
      });

    if (rows.length === 0) {
      toast.error("Pick at least one product");
      return;
    }

    const safeName = (scopeName ?? "pricing-sheet")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    downloadCSV(rows, `${safeName}-pricing`);
    toast.success(`Exported ${rows.length} product${rows.length === 1 ? "" : "s"}`);
    onOpenChange(false);
  };

  const handlePrint = () => {
    const picked = products.filter((p) => selected.has(p.id));
    if (picked.length === 0) {
      toast.error("Pick at least one product");
      return;
    }
    const rows = picked.map((p) => ({
      sku: p.sku,
      name: p.name,
      category: p.category,
      basePrice: Number(p.price_usd ?? 0),
      discountPercent: discount,
      markupPercent: markup,
    }));
    const baseBrand: CompanyBrand = brand ?? {
      company_name: "",
      logo_url: null,
      contact_phone: null,
      contact_email: null,
      website: null,
      instagram: null,
      address: null,
      tagline: null,
    };
    openPrintableCatalog({
      brand: {
        ...baseBrand,
        logo_url: new URL(neraBeautyLogo, window.location.origin).href,
        contact_email: BRAND_EMAIL,
      },
      store: {
        name: storeInfo?.name ?? scopeName ?? "Wholesale Partner",
        contact_name: storeInfo?.contact_name ?? null,
        phone: storeInfo?.phone ?? null,
        email: storeInfo?.email ?? null,
        address: storeInfo?.address ?? null,
      },
      rows,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>
            Export pricing sheet{scopeName ? ` — ${scopeName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Discount % (off our price)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Wholesale price = Our price × (1 − discount)
              </p>
            </div>
            <div className="space-y-2">
              <Label>Markup % (recommended retail)</Label>
              <Input
                type="number"
                min={0}
                step="0.1"
                value={markup}
                onChange={(e) => setMarkup(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Recommended retail = Our price × (1 + markup)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Products ({selected.size} selected)</Label>
              <Button variant="ghost" size="sm" onClick={toggleAllVisible}>
                {filtered.every((p) => selected.has(p.id)) && filtered.length > 0
                  ? "Deselect visible"
                  : "Select visible"}
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search SKU, name, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="border rounded-md max-h-[40vh] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  No products match.
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((p) => {
                    const isOn = selected.has(p.id);
                    const ourPrice = Number(p.price_usd ?? 0);
                    const wholesale = ourPrice * (1 - discount / 100);
                    return (
                      <li
                        key={p.id}
                        onClick={() => toggle(p.id)}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/50"
                      >
                        <Checkbox checked={isOn} onCheckedChange={() => toggle(p.id)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{p.sku}</span>
                            <Badge variant="outline" className="text-[10px] py-0 h-4">
                              {p.category}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right text-xs whitespace-nowrap">
                          <div className="text-muted-foreground">
                            ${ourPrice.toFixed(2)}
                          </div>
                          <div className="font-medium">
                            → ${wholesale.toFixed(2)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 border-t gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handlePrint} disabled={selected.size === 0}>
            <Printer className="h-4 w-4 mr-2" />
            Print branded sheet
          </Button>
          <Button onClick={handleExport} disabled={selected.size === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
