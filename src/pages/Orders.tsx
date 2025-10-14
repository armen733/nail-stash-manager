import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Search, Plus, CheckCircle2, Clock, History, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
  salon_id: string;
  order_date: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  created_at: string;
  salons: {
    name: string;
  };
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
  const [searchTerm, setSearchTerm] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    salon_id: "",
    notes: "",
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

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
      const subtotal = calculateTotal();
      const tax = subtotal * 0.1;
      const total = subtotal + tax;
      
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            salon_id: formData.salon_id,
            notes: formData.notes || null,
            created_by: user?.id,
            status: "Draft",
            subtotal,
            tax,
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

  const activeOrders = orders.filter((order) => order.status === "Draft" || order.status === "Confirmed");
  const completedOrders = orders.filter((order) => order.status === "Delivered" || order.status === "Paid");

  const filteredActiveOrders = activeOrders.filter((order) =>
    order.salons?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCompletedOrders = completedOrders.filter((order) =>
    order.salons?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Orders</h1>
          <p className="text-muted-foreground mt-1">Track and manage orders</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                    Add Product
                  </Button>
                </div>

                {orderItems.map((item, index) => {
                  const product = products.find(p => p.id === item.product_id);
                  const hasStockWarning = product && product.stock_on_hand !== null && item.quantity > product.stock_on_hand;
                  
                  return (
                    <div key={index} className="space-y-2">
                      <div className="flex gap-2 items-end">
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
                                  <span className="flex items-center gap-2">
                                    <span className="font-mono text-xs text-muted-foreground">[{product.sku}]</span>
                                    <span>{product.name}</span>
                                    <span className="text-muted-foreground">- ${product.price_usd}</span>
                                    {product.stock_on_hand !== null && <span className="text-muted-foreground">(Stock: {product.stock_on_hand})</span>}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateOrderItem(index, "quantity", parseInt(e.target.value))}
                            placeholder="Qty"
                            className={hasStockWarning ? "border-destructive" : ""}
                          />
                        </div>
                        <div className="w-28 flex items-center justify-center">
                          <span className="font-semibold">
                            ${(item.quantity * item.unit_price).toFixed(2)}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removeOrderItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
                  <div className="border-t pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span>${calculateTotal().toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Tax (10%):</span>
                      <span>${(calculateTotal() * 0.1).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total:</span>
                      <span>${(calculateTotal() * 1.1).toFixed(2)}</span>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Salon</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActiveOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>{new Date(order.order_date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-medium">{order.salons?.name}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {order.order_items && order.order_items.length > 0 ? (
                              order.order_items.map((item, idx) => (
                                <div key={idx} className="text-muted-foreground">
                                  {item.products?.name} × {item.quantity}
                                </div>
                              ))
                            ) : (
                              <span className="text-muted-foreground">No items</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell className="font-semibold">${order.total.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => handleMarkAsDone(order.id)}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Mark Done
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Salon</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompletedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>{new Date(order.order_date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-medium">{order.salons?.name}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {order.order_items && order.order_items.length > 0 ? (
                              order.order_items.map((item, idx) => (
                                <div key={idx} className="text-muted-foreground">
                                  {item.products?.name} × {item.quantity}
                                </div>
                              ))
                            ) : (
                              <span className="text-muted-foreground">No items</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell className="font-semibold">${order.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Orders;
