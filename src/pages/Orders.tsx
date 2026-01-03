import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, History, Trash2, AlertTriangle, Download, RefreshCw, CheckCircle, MoreVertical, Package, Clock, TruckIcon, CreditCard, Printer, ChevronRight, CheckSquare, Square } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
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

import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

interface Product {
  id: string;
  name: string;
  price_usd: number;
  sku: string;
  stock_on_hand: number | null;
  image_url: string | null;
  product_images?: { image_url: string }[];
}

interface OrderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

const Orders = () => {
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [formData, setFormData] = useState({
    salon_id: "",
    profile_id: "",
    notes: "",
  });

  const [newUserData, setNewUserData] = useState({
    full_name: "",
    email: "",
    phone: "",
    address: "",
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  useEffect(() => {
    fetchData();

    // Notifications disabled

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
          
          // Push notifications disabled

          
          fetchData(); // Refresh orders list
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);

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
      const [ordersRes, salonsRes, productsRes, profilesRes] = await Promise.all([
        supabase.from("orders").select("*, salons(name), order_items(id, quantity, unit_price, products(name))").order("order_date", { ascending: false }),
        supabase.from("salons").select("id, name, phone, email, address").order("name"),
        supabase.from("products").select("id, name, price_usd, sku, stock_on_hand, image_url, product_images(image_url)").order("name"),
        supabase.from("profiles").select("id, full_name, email, phone").order("full_name"),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (salonsRes.error) throw salonsRes.error;
      if (productsRes.error) throw productsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      setOrders(ordersRes.data || []);
      setSalons(salonsRes.data || []);
      setProducts(productsRes.data || []);
      setProfiles(profilesRes.data || []);
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

  const handleDeleteOrder = async () => {
    if (!deleteOrderId) return;
    
    try {
      // First delete order items
      const { error: itemsError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", deleteOrderId);
      
      if (itemsError) throw itemsError;

      // Then delete the order
      const { error: orderError } = await supabase
        .from("orders")
        .delete()
        .eq("id", deleteOrderId);
      
      if (orderError) throw orderError;

      toast({ title: "Success", description: "Order deleted" });
      setDeleteOrderId(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setDeleteOrderId(null);
    }
  };

  const handleMarkDelivered = async (orderId: string) => {
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

  const handleCreateInlineUser = async () => {
    if (!newUserData.full_name || !newUserData.email || !newUserData.address) {
      toast({
        title: "Error",
        description: "Name, email, and address are required",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newUserData.email,
          full_name: newUserData.full_name,
          phone: newUserData.phone || null,
          role: 'Customer',
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Refresh profiles and select the new user
      await fetchData();
      setFormData({ ...formData, profile_id: data.user.id });
      setShowNewUserForm(false);
      setNewUserData({ full_name: "", email: "", phone: "", address: "" });
      
      toast({
        title: "Success",
        description: "Customer created and selected",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreatingUser(false);
    }
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
            salon_id: formData.salon_id || null,
            profile_id: formData.profile_id || null,
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
      setFormData({ salon_id: "", profile_id: "", notes: "" });
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



  const activeOrders = orders.filter((order) => order.status !== "Delivered" && order.status !== "Paid");
  const completedOrders = orders.filter((order) => order.status === "Delivered" || order.status === "Paid");

  // Order status breakdown data for chart
  const orderStatusData = useMemo(() => {
    const statusCounts = orders.reduce((acc: Record<string, number>, order) => {
      const status = order.status || 'Draft';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const statusConfig: Record<string, { color: string; icon: any }> = {
      'Draft': { color: 'hsl(45, 85%, 55%)', icon: Clock },
      'Confirmed': { color: 'hsl(210, 70%, 50%)', icon: Package },
      'Sent': { color: 'hsl(280, 60%, 55%)', icon: TruckIcon },
      'Delivered': { color: 'hsl(145, 60%, 45%)', icon: CheckCircle },
      'Paid': { color: 'hsl(145, 70%, 40%)', icon: CreditCard },
    };

    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      color: statusConfig[status]?.color || 'hsl(var(--muted))',
      icon: statusConfig[status]?.icon || Package,
      percentage: orders.length > 0 ? Math.round((count / orders.length) * 100) : 0,
    }));
  }, [orders]);

  const normalizedSearch = searchTerm.toLowerCase();
  const filterBySalonName = (order: Order) => {
    const name = order.salons?.name || order.customer_name || '';
    const matchesSearch = name.toLowerCase().includes(normalizedSearch);
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  };

  const filteredActiveOrders = activeOrders.filter(filterBySalonName);
  const filteredCompletedOrders = completedOrders.filter(filterBySalonName);
  const allFilteredOrders = [...filteredActiveOrders, ...filteredCompletedOrders];

  const exportOrders = () => {
    const exportData = allFilteredOrders.map(o => ({
      Date: new Date(o.order_date).toLocaleDateString(),
      'Salon/Customer': o.salons?.name || o.customer_name || 'N/A',
      Status: o.status,
      Subtotal: `$${o.subtotal.toFixed(2)}`,
      Tax: `$${o.tax.toFixed(2)}`,
      Total: `$${o.total.toFixed(2)}`,
      Notes: o.notes || '',
    }));
    downloadCSV(exportData, 'orders');
    toast({ title: "Success", description: "Orders exported successfully" });
  };

  const handleQuickReorder = async (order: Order) => {
    if (!order.order_items || order.order_items.length === 0) {
      toast({ title: "Error", description: "No items found in this order", variant: "destructive" });
      return;
    }

    try {
      const orderItemsData = order.order_items.map(item => ({
        product_id: item.products ? products.find(p => p.name === item.products.name)?.id || '' : '',
        quantity: item.quantity,
        unit_price: item.unit_price,
      }));

      setOrderItems(orderItemsData);
      setFormData({ salon_id: order.salon_id || '', profile_id: '', notes: `Reorder from ${new Date(order.order_date).toLocaleDateString()}` });
      setIsDialogOpen(true);
      toast({ title: "Quick Reorder", description: "Order items loaded. Update and submit." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const ORDER_STATUSES = ['Draft', 'Confirmed', 'Shipped', 'Delivered', 'Paid'] as const;
  
  const getStatusIndex = (status: string) => ORDER_STATUSES.indexOf(status as typeof ORDER_STATUSES[number]);
  
  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus as any })
        .eq("id", orderId);
      
      if (error) throw error;
      toast({ title: "Success", description: `Order status updated to ${newStatus}` });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkStatusUpdate = async () => {
    if (!bulkStatus || selectedOrders.size === 0) return;
    
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: bulkStatus as any })
        .in("id", Array.from(selectedOrders));
      
      if (error) throw error;
      
      toast({ 
        title: "Success", 
        description: `${selectedOrders.size} orders updated to ${bulkStatus}` 
      });
      setSelectedOrders(new Set());
      setBulkStatusDialogOpen(false);
      setBulkStatus("");
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const toggleOrderSelection = (orderId: string) => {
    const newSelection = new Set(selectedOrders);
    if (newSelection.has(orderId)) {
      newSelection.delete(orderId);
    } else {
      newSelection.add(orderId);
    }
    setSelectedOrders(newSelection);
  };

  const toggleSelectAll = (ordersList: Order[]) => {
    if (ordersList.every(o => selectedOrders.has(o.id))) {
      // Deselect all
      const newSelection = new Set(selectedOrders);
      ordersList.forEach(o => newSelection.delete(o.id));
      setSelectedOrders(newSelection);
    } else {
      // Select all
      const newSelection = new Set(selectedOrders);
      ordersList.forEach(o => newSelection.add(o.id));
      setSelectedOrders(newSelection);
    }
  };

  const printPackingSlip = (order: Order) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: "Error", description: "Please allow popups to print", variant: "destructive" });
      return;
    }

    const itemsHtml = (order.order_items || []).map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.products?.name || 'Unknown'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.unit_price.toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(item.quantity * item.unit_price).toFixed(2)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Packing Slip - Order ${order.id.slice(0, 8)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #333; }
          .logo { font-size: 24px; font-weight: bold; }
          .order-info { text-align: right; }
          .order-id { font-size: 14px; color: #666; }
          .date { font-size: 14px; margin-top: 5px; }
          .addresses { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .address-block { flex: 1; }
          .address-block h3 { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; }
          .address-block p { margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f5f5f5; padding: 12px 8px; text-align: left; font-weight: 600; }
          th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: center; }
          th:last-child { text-align: right; }
          .totals { margin-left: auto; width: 250px; }
          .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
          .totals-row.total { font-weight: bold; font-size: 18px; border-top: 2px solid #333; padding-top: 12px; }
          .notes { margin-top: 30px; padding: 15px; background: #f9f9f9; border-radius: 8px; }
          .notes h3 { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; }
          .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
          .status-Draft { background: #fef3c7; color: #92400e; }
          .status-Confirmed { background: #dbeafe; color: #1e40af; }
          .status-Shipped { background: #e9d5ff; color: #7c3aed; }
          .status-Delivered { background: #d1fae5; color: #065f46; }
          .status-Paid { background: #d1fae5; color: #065f46; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo"><img src="/images/nera-logo-packing.png" alt="NERA Beauty" style="height: 60px; width: auto;" /></div>
          <div class="order-info">
            <div class="order-id">Order #${order.id.slice(0, 8).toUpperCase()}</div>
            <div class="date">${new Date(order.order_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div style="margin-top: 8px;"><span class="status-badge status-${order.status}">${order.status}</span></div>
          </div>
        </div>
        
        <div class="addresses">
          <div class="address-block">
            <h3>Ship To</h3>
            <p><strong>${order.customer_name || order.salons?.name || '—'}</strong></p>
            ${order.customer_address ? `<p>${order.customer_address}</p>` : ''}
            ${order.customer_phone ? `<p>${order.customer_phone}</p>` : ''}
            ${order.customer_email ? `<p>${order.customer_email}</p>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-row"><span>Subtotal</span><span>$${order.subtotal.toFixed(2)}</span></div>
          <div class="totals-row"><span>Tax</span><span>$${order.tax.toFixed(2)}</span></div>
          <div class="totals-row total"><span>Total</span><span>$${order.total.toFixed(2)}</span></div>
        </div>

        ${order.notes ? `<div class="notes"><h3>Notes</h3><p>${order.notes}</p></div>` : ''}
        
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      Draft: "outline",
      Confirmed: "default",
      Shipped: "default",
      Delivered: "secondary",
      Paid: "secondary",
    };

    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  // Status tracker component
  const OrderStatusTracker = ({ order }: { order: Order }) => {
    const currentIndex = getStatusIndex(order.status);
    const displayStatuses = ['Confirmed', 'Shipped', 'Delivered'] as const;
    
    return (
      <div className="flex items-center gap-0.5 py-2 flex-wrap">
        {displayStatuses.map((status, idx) => {
          const statusIndex = ORDER_STATUSES.indexOf(status);
          const isCompleted = statusIndex <= currentIndex;
          const isCurrent = status === order.status;
          
          return (
            <div key={status} className="flex items-center shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (status !== order.status) {
                    handleUpdateOrderStatus(order.id, status);
                  }
                }}
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all whitespace-nowrap
                  ${isCompleted && !isCurrent ? 'bg-primary/20 text-primary' : ''}
                  ${isCurrent ? 'bg-primary text-primary-foreground' : ''}
                  ${!isCompleted ? 'bg-muted text-muted-foreground hover:bg-muted/80' : ''}
                  hover:scale-105 cursor-pointer
                `}
              >
                {isCompleted && !isCurrent && <CheckCircle className="h-3 w-3 shrink-0" />}
                <span>{status}</span>
              </button>
              {idx < displayStatuses.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
      <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Orders</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Track and manage orders</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 min-h-[44px] px-4 text-sm">
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden xs:inline">Create </span>Order
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Order</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="profile_id">Customer</Label>
                  <Select 
                    value={formData.profile_id} 
                    onValueChange={(value) => {
                      if (value === "new") {
                        setShowNewUserForm(true);
                      } else {
                        setFormData({ ...formData, profile_id: value });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">
                        <span className="flex items-center gap-2 text-primary">
                          <Plus className="h-4 w-4" /> Add New Customer
                        </span>
                      </SelectItem>
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
                  <Label htmlFor="salon_id">Salon</Label>
                  <Select value={formData.salon_id} onValueChange={(value) => setFormData({ ...formData, salon_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select salon (optional)" />
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
              </div>

              {showNewUserForm && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold">New Customer Details</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewUserForm(false)}>
                      Cancel
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="new_full_name">Name *</Label>
                      <Input
                        id="new_full_name"
                        value={newUserData.full_name}
                        onChange={(e) => setNewUserData({ ...newUserData, full_name: e.target.value })}
                        placeholder="John Doe"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new_email">Email *</Label>
                      <Input
                        id="new_email"
                        type="email"
                        value={newUserData.email}
                        onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                        placeholder="john@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new_phone">Phone</Label>
                      <Input
                        id="new_phone"
                        type="tel"
                        value={newUserData.phone}
                        onChange={(e) => setNewUserData({ ...newUserData, phone: e.target.value })}
                        placeholder="+1 234 567 8900"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new_address">Address *</Label>
                      <Input
                        id="new_address"
                        value={newUserData.address}
                        onChange={(e) => setNewUserData({ ...newUserData, address: e.target.value })}
                        placeholder="123 Main St"
                        required
                      />
                    </div>
                  </div>
                  <Button 
                    type="button" 
                    size="sm" 
                    onClick={handleCreateInlineUser}
                    disabled={isCreatingUser || !newUserData.full_name || !newUserData.email || !newUserData.address}
                  >
                    {isCreatingUser ? "Creating..." : "Create & Select Customer"}
                  </Button>
                </div>
              )}

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
                                  <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded bg-muted flex-shrink-0 overflow-hidden">
                                      {(product.image_url || product.product_images?.[0]?.image_url) ? (
                                        <img 
                                          src={product.image_url || product.product_images?.[0]?.image_url} 
                                          alt={product.name}
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                                          No img
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-medium">{product.name}</span>
                                      <span className="text-xs text-muted-foreground">
                                        ${product.price_usd} • Stock: {product.stock_on_hand ?? 0}
                                      </span>
                                    </div>
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
                <Button type="submit" disabled={(showNewUserForm || (!formData.salon_id && !formData.profile_id)) || orderItems.length === 0}>
                  Create Order
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Dialog open={!!viewOrder} onOpenChange={(open) => !open && setViewOrder(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {viewOrder && (
            <div className="space-y-4">
              {/* Order Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Order ID</Label>
                  <div className="font-mono text-sm mt-1">{viewOrder.id.slice(0, 8)}...</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Status</Label>
                  <div className="mt-1">{getStatusBadge(viewOrder.status)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Order Date</Label>
                  <div className="mt-1">{new Date(viewOrder.order_date).toLocaleDateString()}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Placed At</Label>
                  <div className="mt-1">{new Date(viewOrder.created_at).toLocaleString()}</div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Customer Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <div className="font-medium mt-1">{viewOrder.customer_name || viewOrder.salons?.name || "—"}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <div className="font-medium mt-1 break-all">{viewOrder.customer_email || "—"}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <div className="font-medium mt-1">{viewOrder.customer_phone || "—"}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <Label className="text-xs text-muted-foreground">Address</Label>
                    <div className="font-medium mt-1">{viewOrder.customer_address || "—"}</div>
                  </div>
                </div>
              </div>

              {/* Salon Info */}
              {viewOrder.salons?.name && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Salon</h3>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="font-medium">{viewOrder.salons.name}</div>
                  </div>
                </div>
              )}

              {/* Order Items */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Order Items</h3>
                <div className="space-y-2">
                  {(viewOrder.order_items || []).map((it) => (
                    <div key={it.id} className="flex justify-between items-center bg-muted/50 rounded-lg p-3">
                      <div>
                        <span className="font-medium">{it.products?.name}</span>
                        <span className="text-muted-foreground ml-2">× {it.quantity}</span>
                      </div>
                      <span className="font-semibold">${(it.quantity * it.unit_price).toFixed(2)}</span>
                    </div>
                  ))}
                  {(!viewOrder.order_items || viewOrder.order_items.length === 0) && (
                    <div className="text-muted-foreground text-center py-4">No items in this order</div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {viewOrder.notes && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Notes</h3>
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">{viewOrder.notes}</div>
                </div>
              )}

              {/* Totals */}
              <div className="border-t pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${viewOrder.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>${viewOrder.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg border-t pt-2">
                    <span>Total</span>
                    <span className="text-primary">${viewOrder.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => printPackingSlip(viewOrder)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Packing Slip
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Order Status Breakdown */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Order Status Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No orders yet. Create your first order to see status breakdown.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Status Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3">
                {orderStatusData.map((status) => {
                  const IconComponent = status.icon;
                  return (
                    <div 
                      key={status.status}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div 
                        className="p-2 rounded-full" 
                        style={{ backgroundColor: `${status.color}20` }}
                      >
                        <IconComponent className="h-4 w-4" style={{ color: status.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xl font-bold">{status.count}</div>
                        <div className="text-xs text-muted-foreground truncate">{status.status}</div>
                      </div>
                      <div className="text-sm font-medium text-muted-foreground">
                        {status.percentage}%
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Donut Chart */}
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={orderStatusData}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      label={({ cx, cy, midAngle, outerRadius, status, percentage }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = outerRadius + 25;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return percentage >= 5 ? (
                          <text
                            x={x}
                            y={y}
                            textAnchor={x > cx ? 'start' : 'end'}
                            dominantBaseline="central"
                            fontSize={11}
                            fill="currentColor"
                          >
                            <tspan fontWeight="600">{status}</tspan>
                            <tspan x={x} dy="1.2em" opacity={0.7}>{percentage}%</tspan>
                          </text>
                        ) : null;
                      }}
                      labelLine={{
                        stroke: 'currentColor',
                        strokeWidth: 1,
                        strokeOpacity: 0.3,
                      }}
                    >
                      {orderStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number, name: string) => [value, name]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11 min-h-[44px]"
              />
            </div>
            {selectedOrders.size > 0 && (
              <Button 
                variant="default" 
                className="h-11 min-h-[44px] w-full sm:w-auto"
                onClick={() => setBulkStatusDialogOpen(true)}
              >
                <CheckSquare className="h-4 w-4 mr-2" />
                Update {selectedOrders.size} Orders
              </Button>
            )}
            <Button variant="outline" className="h-11 min-h-[44px] w-full sm:w-auto" onClick={exportOrders}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="active">
                Active Orders ({filteredActiveOrders.length})
              </TabsTrigger>
              <TabsTrigger value="history">
                Order History ({filteredCompletedOrders.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-6">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Loading...</div>
              ) : filteredActiveOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <RefreshCw className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No active orders.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Select All */}
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <button
                      onClick={() => toggleSelectAll(filteredActiveOrders)}
                      className="p-1 hover:bg-muted rounded"
                    >
                      {filteredActiveOrders.every(o => selectedOrders.has(o.id)) ? (
                        <CheckSquare className="h-5 w-5 text-primary" />
                      ) : (
                        <Square className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                    <span className="text-sm text-muted-foreground">Select all</span>
                  </div>
                  
                  {filteredActiveOrders.map((order) => (
                    <Card 
                      key={order.id} 
                      className={`shadow-sm cursor-pointer hover:bg-muted/50 transition-colors ${selectedOrders.has(order.id) ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setViewOrder(order)}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleOrderSelection(order.id);
                              }}
                              className="p-1 hover:bg-muted rounded flex-shrink-0"
                            >
                              {selectedOrders.has(order.id) ? (
                                <CheckSquare className="h-5 w-5 text-primary" />
                              ) : (
                                <Square className="h-5 w-5 text-muted-foreground" />
                              )}
                            </button>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-base">{order.salons?.name || order.customer_name || "—"}</span>
                                <span className="text-sm text-muted-foreground">
                                  {new Date(order.order_date).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Status Tracker */}
                          <OrderStatusTracker order={order} />
                          
                          <div className="text-sm">
                            {order.order_items && order.order_items.length > 0 ? (
                              <div className="space-y-1">
                                {order.order_items.slice(0, 2).map((item, idx) => (
                                  <div key={idx} className="text-muted-foreground">
                                    {item.products?.name} × {item.quantity}
                                  </div>
                                ))}
                                {order.order_items.length > 2 && (
                                  <div className="text-muted-foreground text-xs">
                                    +{order.order_items.length - 2} more items
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">No items</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t">
                            <div className="text-lg font-semibold text-primary">
                              ${order.total.toFixed(2)}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  printPackingSlip(order);
                                }}
                              >
                                <Printer className="h-4 w-4 mr-1" />
                                Print
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-9"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteOrderId(order.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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
                    <Card 
                      key={order.id} 
                      className="shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setViewOrder(order)}
                    >
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
                                {order.order_items.slice(0, 2).map((item, idx) => (
                                  <div key={idx} className="text-muted-foreground">
                                    {item.products?.name} × {item.quantity}
                                  </div>
                                ))}
                                {order.order_items.length > 2 && (
                                  <div className="text-muted-foreground text-xs">
                                    +{order.order_items.length - 2} more items
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">No items</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between pt-2">
                            <div className="text-lg font-semibold text-primary">
                              ${order.total.toFixed(2)}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  printPackingSlip(order);
                                }}
                              >
                                <Printer className="h-4 w-4 mr-1" />
                                Print
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-9"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteOrderId(order.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteOrderId} onOpenChange={(open) => !open && setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Status Update Dialog */}
      <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Update status for {selectedOrders.size} selected order{selectedOrders.size > 1 ? 's' : ''}.
            </p>
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkStatusUpdate} disabled={!bulkStatus}>
              Update {selectedOrders.size} Order{selectedOrders.size > 1 ? 's' : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;
