import { ShoppingCart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CartItem } from "./types";

interface CartPanelProps {
  cart: CartItem[];
  onClear: () => void;
  onPlaceOrder: () => void;
}

export function CartPanel({ cart, onClear, onPlaceOrder }: CartPanelProps) {
  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price_usd * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (cart.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 z-50">
      <Card className="shadow-lg border-2">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              <h3 className="font-semibold">Cart ({cartItemCount} items)</h3>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              className="min-h-[44px]"
              onClick={onClear}
            >
              Clear
            </Button>
          </div>
          <div className="max-h-48 overflow-y-auto mb-3 space-y-2">
            {cart.map(item => (
              <div key={item.product.id} className="flex items-center justify-between text-sm">
                <span className="flex-1 truncate">{item.product.name}</span>
                <span className="text-muted-foreground mx-2">×{item.quantity}</span>
                <span className="font-semibold">${(item.product.price_usd * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 mb-3">
            <div className="flex items-center justify-between font-bold text-lg">
              <span>Total</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
          </div>
          <Button 
            className="w-full min-h-[44px]" 
            onClick={onPlaceOrder}
          >
            Place Order
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
