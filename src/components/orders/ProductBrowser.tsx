import { useState, useMemo } from "react";
import { Search, Plus, Minus, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategoryVariantTypes, getCategories, getVariantTypesForCategory } from "@/hooks/useCategoryVariantTypes";

interface Product {
  id: string;
  name: string;
  price_usd: number;
  sku: string;
  stock_on_hand: number | null;
  image_url: string | null;
  product_images?: { image_url: string }[];
  category?: string;
  bit_type?: string | null;
}

interface OrderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

interface ProductBrowserProps {
  products: Product[];
  orderItems: OrderItem[];
  onAddProduct: (product: Product) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveProduct: (productId: string) => void;
}

export function ProductBrowser({
  products,
  orderItems,
  onAddProduct,
  onUpdateQuantity,
  onRemoveProduct,
}: ProductBrowserProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedVariantType, setSelectedVariantType] = useState<string>("all");

  const { data: categoryVariantTypes = [] } = useCategoryVariantTypes();
  
  const categories = useMemo(() => getCategories(categoryVariantTypes), [categoryVariantTypes]);
  const variantTypes = useMemo(() => 
    getVariantTypesForCategory(categoryVariantTypes, selectedCategory), 
    [categoryVariantTypes, selectedCategory]
  );

  // Reset variant type when category changes
  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setSelectedVariantType("all");
  };

  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }
    
    // Filter by variant type (checks bit_type first, falls back to product name)
    if (selectedVariantType !== "all") {
      const variantLower = selectedVariantType.toLowerCase();
      filtered = filtered.filter(p => 
        p.bit_type?.toLowerCase().includes(variantLower) ||
        p.name.toLowerCase().includes(variantLower)
      );
    }
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [products, searchTerm, selectedCategory, selectedVariantType]);

  const getItemQuantity = (productId: string) => {
    return orderItems.find(item => item.product_id === productId)?.quantity || 0;
  };

  return (
    <div className="space-y-3">
      {/* Filters Row */}
      <div className="flex gap-2">
        <Select value={selectedCategory} onValueChange={handleCategoryChange}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={selectedVariantType} onValueChange={setSelectedVariantType}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {variantTypes.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search products by name, SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Products Grid */}
      <ScrollArea className="h-[300px] rounded-lg border">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2">
          {filteredProducts.map((product) => {
            const quantity = getItemQuantity(product.id);
            const isLowStock = product.stock_on_hand !== null && product.stock_on_hand <= 5;
            const isOutOfStock = product.stock_on_hand !== null && product.stock_on_hand <= 0;
            const productImage = product.image_url || product.product_images?.[0]?.image_url;

            return (
              <div 
                key={product.id}
                className={`
                  relative border rounded-lg p-2 transition-all
                  ${quantity > 0 ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'hover:border-muted-foreground/30'}
                  ${isOutOfStock ? 'opacity-60' : ''}
                `}
              >
                {/* Image */}
                <div className="aspect-square rounded bg-muted mb-2 overflow-hidden">
                  {productImage ? (
                    <img 
                      src={productImage} 
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                      <Package className="h-8 w-8" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="space-y-1">
                  <div className="text-xs font-medium line-clamp-2 leading-tight h-8">
                    {product.name}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">${product.price_usd.toFixed(2)}</span>
                    <span className={`text-xs ${isLowStock ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {product.stock_on_hand ?? 0} left
                    </span>
                  </div>
                </div>

                {/* Quantity Badge */}
                {quantity > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center">
                    {quantity}
                  </Badge>
                )}

                {/* Add/Remove Controls */}
                <div className="mt-2">
                  {quantity === 0 ? (
                    <Button 
                      size="sm" 
                      className="w-full h-8"
                      onClick={() => onAddProduct(product)}
                      disabled={isOutOfStock}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  ) : (
                    <div className="flex items-center justify-between gap-1">
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="h-8 w-8"
                        onClick={() => {
                          if (quantity === 1) {
                            onRemoveProduct(product.id);
                          } else {
                            onUpdateQuantity(product.id, quantity - 1);
                          }
                        }}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-semibold text-sm">{quantity}</span>
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="h-8 w-8"
                        onClick={() => onUpdateQuantity(product.id, quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Package className="h-8 w-8 mb-2" />
            <p className="text-sm">No products found</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
