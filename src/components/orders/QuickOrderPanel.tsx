import { useState } from "react";
import { ShoppingCart, Minus, Plus, X, User, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CartItem } from "@/components/products/types";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

interface QuickOrderPanelProps {
  cart: CartItem[];
  profiles: Profile[];
  onClear: () => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onOrderCreated: () => void;
  onRefreshProducts: () => void;
}

export function QuickOrderPanel({
  cart,
  profiles,
  onClear,
  onUpdateQuantity,
  onOrderCreated,
  onRefreshProducts,
}: QuickOrderPanelProps) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price_usd * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (cart.length === 0) return null;

  const handleQuickCreateOrder = async () => {
    if (cart.length === 0) {
      toast({ title: "Error", description: "Cart is empty", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Get customer info if profile selected
      let customerName: string | null = null;
      let customerEmail: string | null = null;
      let customerPhone: string | null = null;
      
      if (selectedProfileId) {
        const profile = profiles.find(p => p.id === selectedProfileId);
        if (profile) {
          customerName = profile.full_name;
          customerEmail = profile.email;
          customerPhone = profile.phone;
        }
      }

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            profile_id: selectedProfileId || null,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            notes: notes || null,
            created_by: user?.id,
            status: "Confirmed", // Quick orders are immediately confirmed
            subtotal: cartTotal,
            tax: 0,
            total: cartTotal,
          },
        ])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItemsData = cart.map(item => ({
        order_id: order.id,
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price_usd,
        line_total: item.quantity * item.product.price_usd,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      // Update stock for each product
      for (const item of cart) {
        const currentStock = item.product.stock_on_hand ?? 0;
        const newStock = Math.max(0, currentStock - item.quantity);
        
        await supabase
          .from("products")
          .update({ stock_on_hand: newStock })
          .eq("id", item.product.id);
      }

      // Send Telegram notification
      const orderItems = cart.map(item => ({
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price_usd,
        line_total: item.quantity * item.product.price_usd,
      }));

      // Send Telegram notification
      console.log('Sending Telegram notification for order:', order.id);
      const { data: notifyData, error: notifyError } = await supabase.functions.invoke('notify-new-order', {
        body: {
          orderId: order.id,
          orderData: {
            customer_name: customerName || 'Walk-in Customer',
            customer_email: customerEmail || 'N/A',
            customer_phone: customerPhone,
            customer_address: 'In-Store Pickup',
            items: orderItems,
            subtotal: cartTotal,
            total: cartTotal,
            notes: notes || null,
          }
        }
      });
      
      if (notifyError) {
        console.error('Telegram notification error:', notifyError);
      } else {
        console.log('Telegram notification sent:', notifyData);
      }

      toast({ 
        title: "✓ Order Created!", 
        description: `Order #${order.id.slice(0, 8).toUpperCase()} - $${cartTotal.toFixed(2)}` 
      });

      // Reset form
      setSelectedProfileId("");
      setNotes("");
      setIsExpanded(false);
      onClear();
      onRefreshProducts();
      onOrderCreated();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-[420px] z-50">
      <Card className="shadow-xl border-2 border-primary/20">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Quick Order ({cartItemCount})</h3>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onClear}
            >
              Clear
            </Button>
          </div>

          {/* Cart Items */}
          <div className="max-h-48 overflow-y-auto mb-3 space-y-2">
            {cart.map(item => (
              <div key={item.product.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                {/* Product thumbnail */}
                <div className="h-10 w-10 rounded bg-muted flex-shrink-0 overflow-hidden">
                  {(item.product.image_url || item.product.images?.[0]?.image_url || (item.product as any).product_images?.[0]?.image_url) ? (
                    <img 
                      src={item.product.image_url || item.product.images?.[0]?.image_url || (item.product as any).product_images?.[0]?.image_url} 
                      alt={item.product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                      —
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.product.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ${item.product.price_usd.toFixed(2)} each
                  </div>
                </div>
                
                {/* Quantity controls */}
                <div className="flex items-center gap-1">
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-7 w-7"
                    onClick={() => onUpdateQuantity(item.product.id, -1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-7 w-7"
                    onClick={() => onUpdateQuantity(item.product.id, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                
                <div className="font-semibold text-sm w-16 text-right">
                  ${(item.product.price_usd * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="border-t pt-3 mb-3">
            <div className="flex items-center justify-between font-bold text-lg">
              <span>Total</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Customer Selection (Collapsible) */}
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full mb-2 text-muted-foreground">
                <User className="mr-2 h-4 w-4" />
                {selectedProfileId 
                  ? profiles.find(p => p.id === selectedProfileId)?.full_name || "Customer selected"
                  : "Add customer (optional)"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pb-3">
              <div className="space-y-2">
                <Label className="text-xs">Customer</Label>
                <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Walk-in (no customer)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Walk-in (no customer)</SelectItem>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{profile.full_name}</span>
                          <span className="text-xs text-muted-foreground">{profile.email}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional order notes..."
                  className="resize-none h-16"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Create Order Button */}
          <Button 
            className="w-full min-h-[44px]" 
            onClick={handleQuickCreateOrder}
            disabled={isCreating}
          >
            {isCreating ? (
              "Creating..."
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Create Order
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
