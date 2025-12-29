import { memo } from "react";
import { Package, Pencil, Copy, Trash2, ShoppingCart, Eye, Minus, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Product } from "./types";
import { LazyImage } from "@/components/ui/lazy-image";

interface ProductCardProps {
  product: Product;
  isSelected: boolean;
  cartQuantity: number;
  onSelect: () => void;
  onQuickView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddToCart: () => void;
  onRemoveFromCart: () => void;
}

const ProductCardComponent = ({
  product,
  isSelected,
  cartQuantity,
  onSelect,
  onQuickView,
  onEdit,
  onDuplicate,
  onDelete,
  onAddToCart,
  onRemoveFromCart,
}: ProductCardProps) => {
  const stockLevel = product.stock_on_hand || 0;
  const reorderLevel = product.reorder_level || 10;
  const isOutOfStock = stockLevel === 0;
  const isLowStock = stockLevel > 0 && stockLevel <= reorderLevel;

  return (
    <Card 
      className={cn(
        "hover:shadow-md transition-all group cursor-pointer overflow-hidden",
        isSelected && "ring-2 ring-primary"
      )}
    >
      <div 
        className="aspect-square bg-muted relative overflow-hidden"
        onClick={onQuickView}
      >
        {(product.images && product.images.length > 0) ? (
          <LazyImage 
            src={product.images[0].image_url} 
            alt={product.name}
            aspectRatio="square"
            className="w-full h-full group-hover:scale-105 transition-transform"
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <Package className="h-8 w-8 text-muted-foreground/30" />
              </div>
            }
          />
        ) : product.image_url ? (
          <LazyImage 
            src={product.image_url} 
            alt={product.name}
            aspectRatio="square"
            className="w-full h-full group-hover:scale-105 transition-transform"
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <Package className="h-8 w-8 text-muted-foreground/30" />
              </div>
            }
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            className="h-5 w-5 bg-background"
          />
        </div>
        {product.is_parent && product.variants && product.variants.length > 0 && (
          <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
            {product.variants.length} variants
          </Badge>
        )}
        {isOutOfStock && (
          <Badge variant="destructive" className="absolute bottom-2 right-2 text-[10px]">
            Out of Stock
          </Badge>
        )}
        {isLowStock && (
          <Badge variant="secondary" className="absolute bottom-2 right-2 text-[10px]">
            Low Stock
          </Badge>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Button size="icon" variant="secondary" className="h-10 w-10">
            <Eye className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <CardContent className="p-3 sm:p-4 space-y-2">
        <div onClick={onQuickView}>
          <h3 className="font-medium text-sm sm:text-base line-clamp-2 mb-1">{product.name}</h3>
          <div className="flex items-center justify-between">
            <span className="font-bold text-primary">${product.price_usd}</span>
            <span className="text-xs text-muted-foreground">SKU: {product.sku}</span>
          </div>
        </div>
        {cartQuantity > 0 ? (
          <div className="flex items-center justify-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-9 w-9 min-h-[36px] min-w-[36px]"
              onClick={onRemoveFromCart}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="font-medium w-8 text-center">{cartQuantity}</span>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-9 w-9 min-h-[36px] min-w-[36px]"
              onClick={onAddToCart}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full min-h-[40px]"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart();
            }}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Add to Cart
          </Button>
        )}
        <div className="flex gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 min-h-[36px]"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 min-h-[36px]"
            onClick={onDuplicate}
            title="Duplicate"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="flex-1 min-h-[36px]"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Memoize to prevent unnecessary re-renders when parent state changes
export const ProductCard = memo(ProductCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.product.id === nextProps.product.id &&
    prevProps.product.stock_on_hand === nextProps.product.stock_on_hand &&
    prevProps.product.price_usd === nextProps.product.price_usd &&
    prevProps.product.name === nextProps.product.name &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.cartQuantity === nextProps.cartQuantity
  );
});
