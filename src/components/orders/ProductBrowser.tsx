import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Search, Plus, Minus, Package, FilterX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
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
  supplier_sku?: string | null;
  supplier?: string | null;
  material?: string | null;
  grit?: string | null;
  variant_name?: string | null;
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

// Optimized thumbnail component with IntersectionObserver-based lazy loading
function ProductThumbnail({ src, alt }: { src: string | null; alt: string }) {
  const [isInView, setIsInView] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !src) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          setStatus('loading');
          observer.disconnect();
        }
      },
      {
        rootMargin: "100px", // Start loading 100px before entering viewport
        threshold: 0,
      }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [src]);

  const handleLoad = useCallback(() => setStatus('loaded'), []);
  const handleError = useCallback(() => setStatus('error'), []);

  if (!src) {
    return (
      <div ref={containerRef} className="h-full w-full flex items-center justify-center">
        <Package className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full flex items-center justify-center">
      {/* Skeleton placeholder */}
      {(status === 'idle' || status === 'loading') && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded" />
      )}
      
      {/* Error fallback */}
      {status === 'error' && (
        <Package className="h-8 w-8 text-muted-foreground" />
      )}
      
      {/* Image - only load when in view */}
      {isInView && status !== 'error' && (
        <img 
          src={src} 
          alt={alt}
          className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
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
  const [filtersHidden, setFiltersHidden] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
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

  // Hide filters when scrolling down, show when scrolling up
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const viewport = container.querySelector("[data-radix-scroll-area-viewport]");
    if (!viewport) return;

    const handleScroll = () => {
      const scrollTop = (viewport as HTMLElement).scrollTop;
      const threshold = 40;
      if (scrollTop > lastScrollTop.current && scrollTop > threshold) {
        setFiltersHidden(true);
      } else if (scrollTop < lastScrollTop.current) {
        setFiltersHidden(false);
      }
      lastScrollTop.current = scrollTop <= 0 ? 0 : scrollTop;
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, []);

  // Ref to measure the filter bar for accurate hide distance
  const filterBarRef = useRef<HTMLDivElement>(null);

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

    // Filter by search term - search across multiple fields
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.supplier_sku?.toLowerCase().includes(term) ||
        p.supplier?.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term) ||
        p.bit_type?.toLowerCase().includes(term) ||
        p.material?.toLowerCase().includes(term) ||
        p.grit?.toLowerCase().includes(term) ||
        p.variant_name?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [products, searchTerm, selectedCategory, selectedVariantType]);

  const getItemQuantity = (productId: string) => {
    return orderItems.find(item => item.product_id === productId)?.quantity || 0;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* Floating filter reveal button (visible only when filters hidden) */}
      {filtersHidden && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="absolute top-2 right-2 z-20 h-8 px-2 gap-1 shadow-sm"
          onClick={() => setFiltersHidden(false)}
        >
          <FilterX className="h-3.5 w-3.5" />
          Filters
        </Button>
      )}

      {/* Product Grid with filters placed inside the scrollable area */}
      <ScrollArea className="flex-1 min-h-[200px] pr-3" ref={scrollContainerRef}>
        {/* Sticky filter bar that hides on scroll down */}
        <div
          ref={filterBarRef}
          className={cn(
            "sticky top-0 z-10 bg-background transition-transform duration-300 ease-out space-y-2 pb-1 mb-2",
            filtersHidden && "-translate-y-[120%]"
          )}
        >
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
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {filteredProducts.map((product) => {
            const quantity = getItemQuantity(product.id);
            const isLowStock = (product.stock_on_hand ?? 0) <= 5;
            const isOutOfStock = (product.stock_on_hand ?? 0) === 0;
            const productImage = product.product_images?.[0]?.image_url || product.image_url;

            return (
              <div
                key={product.id}
                className={`
                  relative p-2 rounded-lg border bg-card flex flex-col
                  ${quantity > 0 ? 'ring-2 ring-primary border-primary' : ''}
                  ${isOutOfStock ? 'opacity-60' : ''}
                `}
              >
                {/* Quantity Badge */}
                {quantity > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center z-10">
                    {quantity}
                  </Badge>
                )}

                {/* Thumbnail - fixed square with IntersectionObserver lazy loading */}
                <div className="w-full aspect-square rounded bg-muted overflow-hidden flex items-center justify-center mb-2">
                  <ProductThumbnail src={productImage} alt={product.name} />
                </div>

                {/* Product Name */}
                <div className="text-xs font-medium line-clamp-2 leading-tight min-h-[2rem] mb-0.5">
                  {product.name}
                </div>

                {/* SKU */}
                <div className="text-[10px] text-muted-foreground mb-1 truncate">
                  {product.sku}
                </div>

                {/* Price & Stock */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-primary">${product.price_usd.toFixed(2)}</span>
                  <span className={`text-xs ${isLowStock ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {product.stock_on_hand ?? 0} left
                  </span>
                </div>

                {/* Add/Remove Controls */}
                <div className="mt-auto">
                  {quantity === 0 ? (
                    <Button
                      type="button"
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
                        type="button"
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
                        type="button"
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
