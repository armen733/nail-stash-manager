import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, Loader2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PARTNER_CATEGORY_NAME } from "@/lib/partner-cost";
import {
  BulkDiscountProduct,
  calculateSalePrice,
  getBulkDiscountTargets,
} from "@/lib/bulk-product-discount";

interface BulkSale {
  id: string;
  name: string;
  discount_percent: number;
  categories: string[] | null;
  status: string;
  created_at: string;
  ended_at: string | null;
  itemCount: number;
}

interface BulkDiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: BulkDiscountProduct[];
  categories: string[];
  onPricesChanged: () => void;
}

export function BulkDiscountDialog({
  open,
  onOpenChange,
  products,
  categories,
  onPricesChanged,
}: BulkDiscountDialogProps) {
  const { toast } = useToast();
  const [targetType, setTargetType] = useState<"all" | "categories">("all");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [discountPercent, setDiscountPercent] = useState("10");
  const [name, setName] = useState("");
  const [sales, setSales] = useState<BulkSale[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [applying, setApplying] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);

  const availableCategories = useMemo(
    () => categories.filter((category) => category !== PARTNER_CATEGORY_NAME),
    [categories],
  );
  const selectedList = targetType === "all" ? [] : Array.from(selectedCategories);
  const targets = useMemo(
    () => getBulkDiscountTargets(products, selectedList),
    [products, selectedList],
  );
  const percent = Number(discountPercent);
  const validPercent = Number.isFinite(percent) && percent > 0 && percent < 100;

  const fetchSales = useCallback(async () => {
    setLoadingSales(true);
    try {
      const { data: saleRows, error: salesError } = await supabase
        .from("bulk_product_sales")
        .select("id, name, discount_percent, categories, status, created_at, ended_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (salesError) throw salesError;

      const saleIds = (saleRows ?? []).map((sale) => sale.id);
      const counts = new Map<string, number>();
      if (saleIds.length) {
        const { data: itemRows, error: itemsError } = await supabase
          .from("bulk_product_sale_items")
          .select("sale_id")
          .in("sale_id", saleIds);
        if (itemsError) throw itemsError;
        for (const item of itemRows ?? []) {
          counts.set(item.sale_id, (counts.get(item.sale_id) ?? 0) + 1);
        }
      }
      setSales((saleRows ?? []).map((sale) => ({ ...sale, itemCount: counts.get(sale.id) ?? 0 })));
    } catch (error: any) {
      toast({ title: "Could not load sales", description: error.message, variant: "destructive" });
    } finally {
      setLoadingSales(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) void fetchSales();
  }, [open, fetchSales]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleApply = async () => {
    if (!validPercent) {
      toast({ title: "Enter a discount between 1% and 99%", variant: "destructive" });
      return;
    }
    if (targetType === "categories" && selectedCategories.size === 0) {
      toast({ title: "Choose at least one category", variant: "destructive" });
      return;
    }
    if (targets.length === 0) {
      toast({ title: "No eligible products found", variant: "destructive" });
      return;
    }

    const scope = targetType === "all" ? "all regular products" : selectedList.join(", ");
    if (!window.confirm(`Apply ${percent}% off to ${targets.length} products in ${scope}? Their website prices will change immediately.`)) return;

    setApplying(true);
    try {
      const saleName = name.trim() || `${percent}% off ${targetType === "all" ? "all products" : selectedList.join(", ")}`;
      const { data, error } = await supabase.rpc("apply_bulk_product_discount", {
        p_name: saleName,
        p_discount_percent: percent,
        p_categories: targetType === "all" ? undefined : selectedList,
      });
      if (error) throw error;
      const count = data?.[0]?.product_count ?? targets.length;
      toast({
        title: "Sale prices are live",
        description: `${count} products are now ${percent}% off. OhLaLa products were not changed.`,
      });
      setName("");
      setSelectedCategories(new Set());
      onPricesChanged();
      await fetchSales();
    } catch (error: any) {
      toast({ title: "Could not apply discount", description: error.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const handleEndSale = async (sale: BulkSale) => {
    if (!window.confirm(`End “${sale.name}” and restore the original prices?`)) return;
    setEndingId(sale.id);
    try {
      const { data: restored, error } = await supabase.rpc("end_bulk_product_discount", {
        p_sale_id: sale.id,
      });
      if (error) throw error;
      const skipped = sale.itemCount - Number(restored ?? 0);
      toast({
        title: "Sale ended",
        description: skipped > 0
          ? `${restored} prices restored. ${skipped} manually changed prices were left alone.`
          : `${restored} original prices restored.`,
      });
      onPricesChanged();
      await fetchSales();
    } catch (error: any) {
      toast({ title: "Could not end sale", description: error.message, variant: "destructive" });
    } finally {
      setEndingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <BadgePercent className="h-5 w-5" />
            Bulk automatic discounts
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6">
          <p className="text-sm text-muted-foreground">
            Lower the actual website prices now. No promo code is needed, and original prices are saved for restoration.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-sale-name">Sale name (optional)</Label>
              <Input
                id="bulk-sale-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Black Friday"
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-sale-percent">Discount percentage</Label>
              <div className="relative">
                <Input
                  id="bulk-sale-percent"
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={discountPercent}
                  onChange={(event) => setDiscountPercent(event.target.value)}
                  className="min-h-[44px] pr-8"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="bulk-discount-scope">Products to discount</Label>
            <Select value={targetType} onValueChange={(value: "all" | "categories") => setTargetType(value)}>
              <SelectTrigger id="bulk-discount-scope" className="min-h-[44px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="all">All products (except NÉRA x OhLaLa)</SelectItem>
                <SelectItem value="categories">Selected categories</SelectItem>
              </SelectContent>
            </Select>
            {targetType === "categories" && (
              <div className="grid max-h-44 gap-1 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                {availableCategories.map((category) => (
                  <label key={category} className="flex min-h-[36px] cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedCategories.has(category)}
                      onCheckedChange={() => toggleCategory(category)}
                    />
                    <span>{category}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              NÉRA x OhLaLa is always excluded because partner products cannot be discounted.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Price preview</span>
              <Badge variant="secondary">{targets.length} products</Badge>
            </div>
            {validPercent && targets.length > 0 ? (
              <div className="mt-3 space-y-2">
                {targets.slice(0, 5).map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{product.name} <span className="text-muted-foreground">({product.sku})</span></span>
                    <span className="shrink-0 font-medium">
                      <span className="mr-2 text-muted-foreground line-through">${product.price_usd.toFixed(2)}</span>
                      ${calculateSalePrice(product.price_usd, percent).toFixed(2)}
                    </span>
                  </div>
                ))}
                {targets.length > 5 && <p className="text-xs text-muted-foreground">+ {targets.length - 5} more products</p>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Choose a valid discount and scope to preview prices.</p>
            )}
          </div>

          <Button
            className="min-h-[44px] w-full"
            onClick={handleApply}
            disabled={applying || !validPercent || targets.length === 0}
          >
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgePercent className="mr-2 h-4 w-4" />}
            Apply discount to {targets.length} products
          </Button>

          <Separator />
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold">Sale history</h3>
              <p className="text-xs text-muted-foreground">End an active sale to restore its saved original prices.</p>
            </div>
            {loadingSales ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bulk sales yet.</p>
            ) : (
              <div className="space-y-2">
                {sales.map((sale) => (
                  <div key={sale.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-medium">{sale.name}</p>
                          <Badge variant={sale.status === "active" ? "default" : "secondary"}>
                            {sale.status === "active" ? "Active" : "Ended"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {sale.discount_percent}% off · {sale.itemCount} products · {sale.categories?.length ? sale.categories.join(", ") : "All regular products"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Started {format(new Date(sale.created_at), "MMM d, yyyy")}
                          {sale.ended_at ? ` · Ended ${format(new Date(sale.ended_at), "MMM d, yyyy")}` : ""}
                        </p>
                      </div>
                      {sale.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={endingId === sale.id}
                          onClick={() => void handleEndSale(sale)}
                        >
                          {endingId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}
                          <span className="hidden sm:inline">End & restore</span>
                          <span className="sm:hidden">End</span>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
