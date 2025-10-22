import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Search, Plus, CheckCircle2, Clock, History, Trash2, AlertTriangle, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { subscribeToPushNotifications } from "@/lib/push-notifications";
import { useNotifications } from "@/hooks/useNotifications";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Order {
  id: string;
  salon_id: string | null;
  order_date: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  created_at: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  salons: {
    name: string;
  } | null;
  order_items?: OrderItemWithProduct[];
}

interface OrderItemWithProduct {
  id: string;
  quantity: number;
  unit_price: number;
  products: {
    name: string;
  };
}

interface Salon {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  price_usd: number;
  sku: string;
  stock_on_hand: number | null;
}

interface OrderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

const Orders = () => {
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { permission, requestPermission } = useNotifications();

  const [formData, setFormData] = useState({
    salon_id: "",
    notes: "",
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  useEffect(() => {
    fetchData();

    // Request notification permission if not already granted
    if (permission === 'default') {
      requestPermission();
    }

    // Real-time subscription for new orders
    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders'
        },
        async (payload) => {
          console.log('New order received:', payload);
          
          // Show toast notification
          toast({
            title: "🔔 New Order Received!",
            description: "A new customer order has been placed.",
          });
          
          // Send push notification
          try {
            const newOrder = payload.new as any;
            await supabase.functions.invoke('send-push-notification', {
              body: {
                customerName: newOrder.customer_name
              }
            });
          } catch (err) {
            console.error('Failed to send push notification:', err);
          }
          
          fetchData(); // Refresh orders list
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast, permission, requestPermission]);

  useEffect(() => {
    // Handle cart items from Products page
    if (location.state?.cartItems) {
      const cartItems = location.state.cartItems;
      const items: OrderItem[] = cartItems.map((item: any) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price_usd,
      }));
      setOrderItems(items);
      setIsDialogOpen(true);
      toast({ 
        title: "Cart loaded", 
        description: `${items.length} products added to new order` 
      });
      // Clear the navigation state
      window.history.replaceState({}, document.title);
    }
  }, [location, toast]);

  const fetchData = async () => {
    try {
      const [ordersRes, salonsRes, productsRes] = await Promise.all([
        supabase.from("orders").select("*, salons(name), order_items(id, quantity, unit_price, products(name))").order("order_date", { ascending: false }),
        supabase.from("salons").select("id, name").order("name"),
        supabase.from("products").select("id, name, price_usd, sku, stock_on_hand").order("name"),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (salonsRes.error) throw salonsRes.error;
      if (productsRes.error) throw productsRes.error;

      setOrders(ordersRes.data || []);
      setSalons(salonsRes.data || []);
      setProducts(productsRes.data || []);
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

  const addOrderItem = () => {
    setOrderItems([...orderItems, { product_id: "", quantity: 1, unit_price: 0 }]);
  };

  const removeOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const updateOrderItem = (index: number, field: keyof OrderItem, value: any) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === "product_id") {
      const product = products.find(p => p.id === value);
      if (product) {
        updated[index].unit_price = product.price_usd;
      }
    }
    
    setOrderItems(updated);
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const getStockWarnings = () => {
    return orderItems
      .map((item, index) => {
        const product = products.find(p => p.id === item.product_id);
        if (product && product.stock_on_hand !== null && item.quantity > product.stock_on_hand) {
          return { index, product, requested: item.quantity, available: product.stock_on_hand };
        }
        return null;
      })
      .filter(Boolean);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (orderItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one product",
        variant: "destructive",
      });
      return;
    }

    const stockWarnings = getStockWarnings();
    if (stockWarnings.length > 0) {
      const warningMessages = stockWarnings.map((w: any) => 
        `${w.product.name}: Requested ${w.requested}, Available ${w.available}`
      ).join('\n');
      
      if (!confirm(`⚠️ STOCK WARNING:\n\n${warningMessages}\n\nDo you want to proceed anyway?`)) {
        return;
      }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const total = calculateTotal();
      
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            salon_id: formData.salon_id,
            notes: formData.notes || null,
            created_by: user?.id,
            status: "Draft",
            subtotal: total,
            tax: 0,
            total,
          },
        ])
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItemsData = orderItems.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.quantity * item.unit_price,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      // Update stock for each product
      for (const item of orderItems) {
        const product = products.find(p => p.id === item.product_id);
        if (product && product.stock_on_hand !== null) {
          const newStock = product.stock_on_hand - item.quantity;
          
          const { error: stockError } = await supabase
            .from("products")
            .update({ stock_on_hand: newStock })
            .eq("id", item.product_id);

          if (stockError) throw stockError;
        }
      }

      toast({ title: "Success", description: "Order created and stock updated" });
      setIsDialogOpen(false);
      setFormData({ salon_id: "", notes: "" });
      setOrderItems([]);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleMarkAsDone = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "Delivered" })
        .eq("id", orderId);

      if (error) throw error;

      toast({ title: "Success", description: "Order marked as delivered" });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEnableNotifications = async () => {
    try {
      await subscribeToPushNotifications();
      setNotificationsEnabled(true);
      toast({
        title: "Notifications Enabled",
        description: "You'll now receive push notifications for new orders",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const activeOrders = orders.filter((order) => order.status === "Draft" || order.status === "Confirmed");
  const completedOrders = orders.filter((order) => order.status === "Delivered" || order.status === "Paid");

  const normalizedSearch = searchTerm.toLowerCase();
  const filterBySalonName = (order: Order) => {
    const name = order.salons?.name || order.customer_name || '';
    return name.toLowerCase().includes(normalizedSearch);
  };

  const filteredActiveOrders = activeOrders.filter(filterBySalonName);
  const filteredCompletedOrders = completedOrders.filter(filterBySalonName);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      Draft: "outline",
      Confirmed: "default",
      Delivered: "secondary",
      Paid: "secondary",
    };

    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  return (
      <div className="space-y-6 animate-fade-in max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Orders</h1>
          <p className="text-muted-foreground mt-1">Track and manage orders</p>
        </div>
        <div className="flex gap-2">
          {!notificationsEnabled && (
            <Button variant="outline" onClick={handleEnableNotifications}>
              <Bell className="mr-2 h-4 w-4" />
              Enable Notifications
            </Button>
          )}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Order
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Order</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="salon_id">Salon *</Label>
                <Select value={formData.salon_id} onValueChange={(value) => setFormData({ ...formData, salon_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select salon" />
                  </SelectTrigger>
                  <SelectContent>
                    {salons.map((salon) => (
                      <SelectItem key={salon.id} value={salon.id}>
                        {salon.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Products *</Label>
                  <Button type="button" size="sm" onClick={addOrderItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>

                {orderItems.map((item, index) => {
                  const product = products.find(p => p.id === item.product_id);
                  const hasStockWarning = product && product.stock_on_hand !== null && item.quantity > product.stock_on_hand;
                  
                  return (
                    <div key={index} className="space-y-2 p-3 border rounded-lg">
                      <div className="flex flex-col gap-3">
                        <div className="flex-1">
                          <Select
                            value={item.product_id}
                            onValueChange={(value) => updateOrderItem(index, "product_id", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((product) => (
                                <SelectItem key={product.id} value={product.id}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{product.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      ${product.price_usd} • Stock: {product.stock_on_hand ?? 0}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateOrderItem(index, "quantity", parseInt(e.target.value))}
                              placeholder="Quantity"
                              className={hasStockWarning ? "border-destructive" : ""}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold whitespace-nowrap">
                              ${(item.quantity * item.unit_price).toFixed(2)}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => removeOrderItem(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {hasStockWarning && (
                        <Alert variant="destructive" className="py-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription className="text-sm">
                            Only {product.stock_on_hand} in stock! You're ordering {item.quantity}.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  );
                })}

                {orderItems.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No products added. Click "Add Product" to start.
                  </p>
                )}

                {orderItems.length > 0 && (
                  <div className="border-t pt-3">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total:</span>
                      <span>${calculateTotal().toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!formData.salon_id || orderItems.length === 0}>
                  Create Order
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Dialog open={!!viewOrder} onOpenChange={(open) => !open && setViewOrder(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {viewOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Order ID</Label>
                  <div className="font-mono text-sm">{viewOrder.id}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <div>{new Date(viewOrder.order_date).toLocaleDateString()}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div>{getStatusBadge(viewOrder.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Salon</Label>
                  <div>{viewOrder.salons?.name || viewOrder.customer_name || "—"}</div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">Customer</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Name: </span>{viewOrder.customer_name || "—"}</div>
                  <div><span className="text-muted-foreground">Email: </span>{viewOrder.customer_email || "—"}</div>
                  <div><span className="text-muted-foreground">Phone: </span>{viewOrder.customer_phone || "—"}</div>
                  <div><span className="text-muted-foreground">Address: </span>{viewOrder.customer_address || "—"}</div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">Items</h3>
                <div className="space-y-1 text-sm">
                  {(viewOrder.order_items || []).map((it) => (
                    <div key={it.id} className="flex justify-between">
                      <span>{it.products?.name} × {it.quantity}</span>
                      <span>${(it.quantity * it.unit_price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>${viewOrder.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="active">
                <Clock className="h-4 w-4 mr-2" />
                Active Orders ({activeOrders.length})
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-2" />
                History ({completedOrders.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-6">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Loading...</div>
              ) : filteredActiveOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No active orders. Create your first order to get started.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredActiveOrders.map((order) => (
                    <Card key={order.id} className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-base">{order.salons?.name || order.customer_name || "—"}</span>
                              {getStatusBadge(order.status)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(order.order_date).toLocaleDateString()}
                            </div>
                            <div className="text-sm">
                              {order.order_items && order.order_items.length > 0 ? (
                                <div className="space-y-1">
                                  {order.order_items.map((item, idx) => (
                                    <div key={idx} className="text-muted-foreground">
                                      {item.products?.name} × {item.quantity}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">No items</span>
                              )}
                            </div>
                            <div className="text-lg font-semibold text-primary pt-1">
                              ${order.total.toFixed(2)}
                            </div>
                          </div>
                          <div className="flex flex-row sm:flex-col gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewOrder(order)}
                              className="flex-1 sm:flex-none"
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleMarkAsDone(order.id)}
                              className="flex-1 sm:flex-none"
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Done
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Loading...</div>
              ) : filteredCompletedOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <History className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No completed orders yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCompletedOrders.map((order) => (
                    <Card key={order.id} className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-base">{order.salons?.name || order.customer_name || "—"}</span>
                            {getStatusBadge(order.status)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(order.order_date).toLocaleDateString()}
                          </div>
                          <div className="text-sm">
                            {order.order_items && order.order_items.length > 0 ? (
                              <div className="space-y-1">
                                {order.order_items.map((item, idx) => (
                                  <div key={idx} className="text-muted-foreground">
                                    {item.products?.name} × {item.quantity}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">No items</span>
                            )}
                          </div>
                          <div className="text-lg font-semibold text-primary pt-1">
                            ${order.total.toFixed(2)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Orders;
