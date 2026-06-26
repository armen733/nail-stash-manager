import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Package, Edit, RefreshCw, Filter, Download, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


interface LowStockProduct {
  id: string;
  name: string;
  sku: string;
  supplier_sku: string | null;
  category: string;
  stock_on_hand: number;
  reorder_level: number;
  price_usd: number;
  supplier: string | null;
  variant_name: string | null;
  image_url: string | null;
  grit: string | null;
  material: string | null;
  shape: string | null;
}

interface CategoryVariantType {
  category: string;
  variant_type: string;
}

interface LocationOption {
  id: string;
  name: string;
  type: string;
  supply_store_id?: string | null;
}

const LowStock = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [categoryVariantTypes, setCategoryVariantTypes] = useState<CategoryVariantType[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<LowStockProduct | null>(null);
  const [newStock, setNewStock] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [variantFilter, setVariantFilter] = useState<string>("all");
  const [hideCopies, setHideCopies] = useState<boolean>(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchLocations();
    fetchCategoryVariantTypes();
  }, []);

  useEffect(() => {
    fetchLowStockProducts();
  }, [locationFilter, locations]);

  // Reset variant filter when category changes
  useEffect(() => {
    setVariantFilter("all");
  }, [categoryFilter]);

  const fetchLocations = async () => {
    const { data, error } = await supabase
      .from("stock_locations")
      .select("id, name, type, supply_store_id, is_default, is_active")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) {
      console.error(error);
      return;
    }
    setLocations((data ?? []) as LocationOption[]);
  };

  const fetchLowStockProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select(`
          id, name, sku, supplier_sku, category, stock_on_hand, reorder_level, price_usd, supplier, variant_name, image_url, grit, material, shape,
          product_images(image_url, display_order)
        `)
        .order("stock_on_hand", { ascending: true });

      if (error) throw error;

      let perLocationStock = new Map<string, number>();
      // For supply-store locations, we only want to flag products the store has actually
      // received from us (i.e. has a stock row, even if currently 0). Other products
      // they never bought can't be "out of stock" for them.
      let stockedProductIds: Set<string> | null = null;
      if (locationFilter !== "all") {
        const { data: stockRows, error: stockErr } = await supabase
          .from("product_stock")
          .select("product_id, quantity")
          .eq("location_id", locationFilter);
        if (stockErr) throw stockErr;
        (stockRows ?? []).forEach((r: any) => {
          perLocationStock.set(r.product_id, Number(r.quantity ?? 0));
        });
        const selectedLoc = locations.find((l) => l.id === locationFilter);
        if (selectedLoc?.type === "consignment") {
          stockedProductIds = new Set((stockRows ?? []).map((r: any) => r.product_id as string));
        }
      }

      // Filter products where stock is at or below reorder level and get first image
      const lowStock = (data || [])
        .map((p) => {
          const firstImage = p.product_images?.sort((a: any, b: any) => a.display_order - b.display_order)[0];
          const stock =
            locationFilter === "all"
              ? p.stock_on_hand
              : perLocationStock.get(p.id) ?? 0;
          return {
            ...p,
            stock_on_hand: stock,
            image_url: p.image_url || firstImage?.image_url || null,
          };
        })
        .filter((p) => {
          if (stockedProductIds && !stockedProductIds.has(p.id)) return false;
          return p.stock_on_hand <= p.reorder_level;
        });

      setProducts(lowStock);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoryVariantTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("category_variant_types")
        .select("category, variant_type")
        .order("category")
        .order("display_order");
      
      if (error) throw error;
      setCategoryVariantTypes(data || []);
    } catch (error: any) {
      console.error("Error fetching category variant types:", error);
    }
  };

  const handleUpdateStock = async () => {
    if (!editingProduct || !newStock) return;

    try {
      const { error } = await supabase
        .from("products")
        .update({ stock_on_hand: parseInt(newStock) })
        .eq("id", editingProduct.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Stock level updated successfully",
      });

      setEditingProduct(null);
      setNewStock("");
      fetchLowStockProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStockStatus = (stock: number) => {
    if (stock === 0) return { label: "Out of Stock", variant: "destructive" as const };
    if (stock <= 5) return { label: "Critical", variant: "destructive" as const };
    return { label: "Low", variant: "secondary" as const };
  };

  const exportLowStockCSV = () => {
    const headers = ["Name", "Variant", "SKU", "Supplier SKU", "Category", "Supplier", "Current Stock", "Reorder Level", "Shortage", "Unit Price"];
    const rows = filteredProducts.map(p => [
      p.name,
      p.variant_name || "",
      p.sku,
      p.supplier_sku || "",
      p.category,
      p.supplier || "",
      p.stock_on_hand,
      p.reorder_level,
      p.reorder_level - p.stock_on_hand,
      p.price_usd.toFixed(2),
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `low-stock-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${filteredProducts.length} low stock products exported to CSV` });
  };

  // Get unique categories from low stock products
  const categories = [...new Set(products.map(p => p.category))].sort();
  
  // Get variant types for selected category from category_variant_types table
  const variantTypesForCategory = categoryFilter === "all" 
    ? [...new Set(categoryVariantTypes.map(cvt => cvt.variant_type))].sort()
    : categoryVariantTypes
        .filter(cvt => cvt.category === categoryFilter)
        .map(cvt => cvt.variant_type);

  // Detect duplicated products (auto-generated by the duplicate action)
  const isCopy = (p: LowStockProduct) =>
    /\(Copy\)/i.test(p.name) || /^G?-?COPY-/i.test(p.sku) || /COPY-/i.test(p.sku);

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    const matchesVariant = variantFilter === "all" || product.variant_name === variantFilter;
    const matchesCopy = !hideCopies || !isCopy(product);
    return matchesCategory && matchesVariant && matchesCopy;
  });

  const copiesCount = products.filter(isCopy).length;
  const outOfStock = filteredProducts.filter((p) => p.stock_on_hand === 0);
  const lowStock = filteredProducts.filter((p) => p.stock_on_hand > 0);

  return (
    <div className="space-y-3 sm:space-y-5 animate-fade-in">
      {/* Compact header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 sm:h-7 sm:w-7 text-destructive flex-shrink-0" />
            <span className="truncate">Low Stock</span>
            <span className="text-xs sm:text-sm font-normal text-muted-foreground">
              ({filteredProducts.length}/{products.length})
            </span>
          </h1>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button
            onClick={exportLowStockCSV}
            variant="outline"
            size="icon"
            className="h-9 w-9 sm:hidden"
            disabled={filteredProducts.length === 0}
            title="Export CSV"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            onClick={fetchLowStockProducts}
            variant="outline"
            size="icon"
            className="h-9 w-9 sm:hidden"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            onClick={exportLowStockCSV}
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex h-9"
            disabled={filteredProducts.length === 0}
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button
            onClick={fetchLowStockProducts}
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex h-9"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Compact filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[180px] sm:w-[200px] h-9 text-sm">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {products.length > 0 && (
          <>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-sm">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={variantFilter}
            onValueChange={setVariantFilter}
            disabled={variantTypesForCategory.length === 0}
          >
            <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-sm">
              <SelectValue placeholder="Variant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Variants</SelectItem>
              {variantTypesForCategory.map(v => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {copiesCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHideCopies((v) => !v)}
              className="h-9 text-xs"
              title="Products with '(Copy)' in their name or 'COPY-' in their SKU come from the Duplicate action on the Products page."
            >
              {hideCopies ? <Eye className="mr-1.5 h-3.5 w-3.5" /> : <EyeOff className="mr-1.5 h-3.5 w-3.5" />}
              {hideCopies ? `Duplicates (${copiesCount})` : "Hide dupes"}
            </Button>
          )}
          {(categoryFilter !== "all" || variantFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setCategoryFilter("all"); setVariantFilter("all"); }}
              className="h-9 text-xs"
            >
              Clear
            </Button>
          )}
          </>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">Loading products...</div>
          </CardContent>
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Package className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">All Stock Levels Good!</h3>
              <p className="text-sm text-muted-foreground">
                No products are currently below their reorder level.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              No products match the selected filters.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {outOfStock.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-destructive">
                  Out of Stock
                </h2>
                <Badge variant="destructive" className="text-xs">{outOfStock.length}</Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {outOfStock.map((product) => renderCompactCard(product))}
              </div>
            </section>
          )}

          {lowStock.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-warning">
                  Low Stock
                </h2>
                <Badge className="bg-warning text-warning-foreground hover:bg-warning/90 border-transparent text-xs">
                  {lowStock.length}
                </Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {lowStock.map((product) => renderCompactCard(product))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Update Stock dialog (single instance, controlled) */}
      <Dialog open={!!editingProduct} onOpenChange={(o) => { if (!o) { setEditingProduct(null); setNewStock(""); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Update Stock Level</DialogTitle>
            <DialogDescription className="text-sm">
              {editingProduct ? `Update the current stock for ${editingProduct.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stock">New Stock Quantity</Label>
              <Input
                id="stock"
                type="number"
                min="0"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                placeholder="Enter new stock quantity"
                className="h-11 min-h-[44px]"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                className="h-11 min-h-[44px]"
                onClick={() => { setEditingProduct(null); setNewStock(""); }}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateStock} className="h-11 min-h-[44px]">
                Update Stock
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  function renderCompactCard(product: LowStockProduct) {
    const status = getStockStatus(product.stock_on_hand);
    const shortage = product.reorder_level - product.stock_on_hand;
    const isOut = product.stock_on_hand === 0;
    return (
      <Card
        key={product.id}
        className={`overflow-hidden border-l-4 ${
          isOut ? "border-l-destructive" : "border-l-warning"
        } shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-shadow`}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex gap-3">
            {/* Thumbnail */}
            <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-6 w-6 text-muted-foreground/50" />
                </div>
              )}
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm sm:text-base leading-tight truncate">
                    {product.name}
                    {product.variant_name && (
                      <span className="font-normal text-muted-foreground ml-1">
                        ({product.variant_name})
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {product.category} · SKU {product.sku}
                  </p>
                </div>
                <Badge
                  variant={status.variant}
                  className={`flex-shrink-0 text-[10px] h-5 px-1.5 ${
                    !isOut ? "bg-warning text-warning-foreground hover:bg-warning/90 border-transparent" : ""
                  }`}
                >
                  {status.label}
                </Badge>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2 mt-3">
                <Stat label="Stock" value={product.stock_on_hand} accent="destructive" />
                <Stat label="Reorder" value={product.reorder_level} />
                <Stat label="Short" value={shortage} accent="destructive" />
                <Stat label="Price" value={`$${product.price_usd.toFixed(2)}`} />
              </div>

              {/* Action */}
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="default"
                  className="h-9 w-full sm:w-auto"
                  onClick={() => {
                    setEditingProduct(product);
                    setNewStock(product.stock_on_hand.toString());
                  }}
                >
                  <Edit className="mr-2 h-3.5 w-3.5" />
                  Update Stock
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
};

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: "destructive" }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      <p className={`text-sm sm:text-base font-bold leading-tight truncate ${accent === "destructive" ? "text-destructive" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export default LowStock;
