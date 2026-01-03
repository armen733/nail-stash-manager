import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Package, Edit, RefreshCw, Filter } from "lucide-react";
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
import { LazyImage } from "@/components/ui/lazy-image";

interface LowStockProduct {
  id: string;
  name: string;
  sku: string;
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

const LowStock = () => {
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<LowStockProduct | null>(null);
  const [newStock, setNewStock] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [variantFilter, setVariantFilter] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchLowStockProducts();
  }, []);

  const fetchLowStockProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, stock_on_hand, reorder_level, price_usd, supplier, variant_name, image_url, grit, material, shape")
        .order("stock_on_hand", { ascending: true });

      if (error) throw error;

      // Filter products where stock is at or below reorder level
      const lowStock = (data || []).filter(
        (p) => p.stock_on_hand <= p.reorder_level
      );

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

  // Get unique categories and variant types
  const categories = [...new Set(products.map(p => p.category))].sort();
  const variantTypes = [...new Set(products.flatMap(p => 
    [p.grit, p.material, p.shape, p.variant_name].filter(Boolean)
  ))].sort();

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    const matchesVariant = variantFilter === "all" || 
      product.grit === variantFilter || 
      product.material === variantFilter || 
      product.shape === variantFilter ||
      product.variant_name === variantFilter;
    return matchesCategory && matchesVariant;
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-destructive flex-shrink-0" />
            <span className="truncate">Low Stock Management</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Products that need reordering ({filteredProducts.length} of {products.length})
          </p>
        </div>
        <Button onClick={fetchLowStockProducts} variant="outline" className="h-11 min-h-[44px] w-full sm:w-auto">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      {products.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[180px] h-10">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={variantFilter} onValueChange={setVariantFilter}>
            <SelectTrigger className="w-full sm:w-[180px] h-10">
              <SelectValue placeholder="Variant Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Variants</SelectItem>
              {variantTypes.map(v => (
                <SelectItem key={v} value={v as string}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(categoryFilter !== "all" || variantFilter !== "all") && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => { setCategoryFilter("all"); setVariantFilter("all"); }}
              className="h-10"
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

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
        <div className="grid gap-4">
          {filteredProducts.map((product) => {
            const status = getStockStatus(product.stock_on_hand);
            return (
              <Card key={product.id} className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-shadow">
                <CardHeader className="pb-3 p-4 sm:p-6 sm:pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div className="flex gap-3 flex-1 min-w-0">
                      {/* Product Thumbnail */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {product.image_url ? (
                          <LazyImage
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-6 w-6 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-lg flex flex-wrap items-center gap-2">
                          <span className="truncate">{product.name}</span>
                          {product.variant_name && (
                            <span className="text-xs sm:text-sm font-normal text-muted-foreground">
                              ({product.variant_name})
                            </span>
                          )}
                        </CardTitle>
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">{product.category}</Badge>
                          <Badge variant="outline" className="text-xs">SKU: {product.sku}</Badge>
                          {product.supplier && (
                            <Badge variant="outline" className="text-xs">{product.supplier}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant={status.variant} className="self-start flex-shrink-0">{status.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Current Stock</p>
                      <p className="text-lg sm:text-2xl font-bold text-destructive">
                        {product.stock_on_hand}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Reorder Level</p>
                      <p className="text-lg sm:text-2xl font-bold">{product.reorder_level}</p>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Unit Price</p>
                      <p className="text-lg sm:text-2xl font-bold">${product.price_usd.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Shortage</p>
                      <p className="text-lg sm:text-2xl font-bold text-destructive">
                        {product.reorder_level - product.stock_on_hand}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="default"
                          className="h-11 min-h-[44px]"
                          onClick={() => {
                            setEditingProduct(product);
                            setNewStock(product.stock_on_hand.toString());
                          }}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Update Stock
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-[95vw] sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle className="text-lg sm:text-xl">Update Stock Level</DialogTitle>
                          <DialogDescription className="text-sm">
                            Update the current stock for {product.name}
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
                              onClick={() => {
                                setEditingProduct(null);
                                setNewStock("");
                              }}
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LowStock;
