import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, History, Trash2, AlertTriangle, Download, RefreshCw, CheckCircle, MoreVertical, Package, Clock, TruckIcon, CreditCard, Printer, ChevronRight, CheckSquare, Square, CalendarIcon, X, Map, ShoppingCart, Minus, ChevronLeft, Settings, Share2, Mail, MessageCircle, Phone, Copy, Undo2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { downloadCSV } from "@/lib/csv-export";
import { supabase } from "@/integrations/supabase/client";
import { getDefaultLocationId } from "@/lib/default-location";
import { NERA_PACKING_LOGO } from "@/lib/packingLogo";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LazyOrdersMap } from "@/components/lazy";
import { ProductBrowser } from "@/components/orders/ProductBrowser";
import { EditOrderDialog } from "@/components/orders/EditOrderDialog";
import { OrderHistoryDialog } from "@/components/orders/OrderHistoryDialog";
import { ReturnDialog } from "@/components/orders/ReturnDialog";
import { Switch } from "@/components/ui/switch";
import { useTaxSettings } from "@/hooks/useTaxSettings";
import { logAudit } from "@/lib/audit-log";
import { enqueueOrder, isOnline } from "@/lib/offline-queue";
import { notifyQueueChanged } from "@/hooks/useOnlineStatus";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";

interface Order {
  id: string;
  salon_id: string | null;
  order_date: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  discount_amount?: number | null;
  notes: string | null;
  technician_name?: string | null;
  created_at: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  created_by?: string | null;
  shipping?: number | null;
  shipping_zone?: string | null;
  salons: {
    name: string;
  } | null;
  order_items?: OrderItemWithProduct[];
}

interface OrderItemWithProduct {
  id: string;
  quantity: number;
  unit_price: number;
  product_id: string;
  products: {
    name: string;
    sku?: string;
    image_url?: string | null;
    product_images?: { image_url: string }[];
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
  category?: string;
  bit_type?: string | null;
}

interface OrderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

const Orders = () => {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const { taxRate, taxSettings, calculateTax, updateTaxSettings } = useTaxSettings();
  const [isTaxSettingsOpen, setIsTaxSettingsOpen] = useState(false);
  const [editTaxRate, setEditTaxRate] = useState("");
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  const [returnOrder, setReturnOrder] = useState<Order | null>(null);
  const [editedOrderIds, setEditedOrderIds] = useState<Set<string>>(new Set());
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [formData, setFormData] = useState({
    salon_id: "",
    profile_id: "",
    notes: "",
    technician_name: "",
    discount: "",
    discountType: "amount" as "amount" | "percent",
  });

  const [newUserData, setNewUserData] = useState({
    full_name: "",
    email: "",
    phone: "",
    address: "",
  });

  const [showNewSalonForm, setShowNewSalonForm] = useState(false);
  const [customerComboOpen, setCustomerComboOpen] = useState(false);
  const [salonComboOpen, setSalonComboOpen] = useState(false);
  const [isCreatingSalon, setIsCreatingSalon] = useState(false);
  const [newSalonData, setNewSalonData] = useState({
    name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [showCartOnly, setShowCartOnly] = useState(false);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  

  // Referral tracking
  const [detectedReferrer, setDetectedReferrer] = useState<{ id: string; name: string; commission_rate: number } | null>(null);

  useEffect(() => {
    fetchData();

    // Notifications disabled

    // Real-time subscription for order changes (new orders + status updates)
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
          // Fetch just the new order with its relations instead of re-fetching everything
          const { data: newOrder } = await supabase
            .from("orders")
            .select("*, salons(name), order_items(id, quantity, unit_price, product_id, products(name, sku, image_url, product_images(image_url)))")
            .eq("id", (payload.new as any).id)
            .single();
          
          if (newOrder) {
            setOrders(prev => [newOrder, ...prev]);
          }
          
          toast({
            title: "🔔 New Order Received!",
            description: "A new customer order has been placed.",
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders'
        },
        async (payload) => {
          const newStatus = (payload.new as any)?.status;
          const oldStatus = (payload.old as any)?.status;
          const updatedId = (payload.new as any)?.id;
          
          // Update just the changed order in state
          setOrders(prev => prev.map(order => 
            order.id === updatedId 
              ? { ...order, ...(payload.new as any) }
              : order
          ));
          
          if (newStatus && newStatus !== oldStatus) {
            toast({
              title: "📦 Order Status Updated",
              description: `Order status changed to: ${newStatus}`,
            });
          }
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

  // Auto-detect referrer when customer is selected
  useEffect(() => {
    const detectReferrer = async () => {
      if (!formData.profile_id) {
        setDetectedReferrer(null);
        return;
      }
      try {
        const { data } = await supabase
          .from("customer_referrals")
          .select("referrer_id, referrers(id, name, commission_rate, status)")
          .eq("customer_id", formData.profile_id)
          .maybeSingle();
        
        if (data?.referrers && (data.referrers as any).status === "active") {
          const ref = data.referrers as any;
          setDetectedReferrer({ id: ref.id, name: ref.name, commission_rate: ref.commission_rate });
        } else {
          setDetectedReferrer(null);
        }
      } catch {
        setDetectedReferrer(null);
      }
    };
    detectReferrer();
  }, [formData.profile_id]);

  const fetchData = async () => {
    try {
      const [ordersRes, salonsRes, productsRes, profilesRes] = await Promise.all([
        supabase.from("orders").select("*, salons(name), order_items(id, quantity, unit_price, product_id, products(name, sku, image_url, product_images(image_url)))").order("order_date", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("salons").select("id, name, phone, email, address").order("name"),
        supabase.from("products").select("id, name, price_usd, sku, stock_on_hand, image_url, category, bit_type, product_images(image_url)").order("name"),
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

      // Load which orders have edit history (for "Edited" badge)
      const { data: editedRows } = await (supabase as any)
        .from("order_edit_history")
        .select("order_id");
      if (editedRows) {
        setEditedOrderIds(new Set((editedRows as any[]).map((r) => r.order_id)));
      }
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
      // Fetch order items to restore stock
      const { data: orderItems, error: fetchError } = await supabase
        .from("order_items")
        .select("product_id, quantity")
        .eq("order_id", deleteOrderId);
      
      if (fetchError) throw fetchError;

      // Restore stock by inserting reverse "return" movements into Main Warehouse.
      // The DB trigger recalculates products.stock_on_hand automatically.
      if (orderItems && orderItems.length > 0) {
        const defaultLocId = await getDefaultLocationId();
        if (defaultLocId) {
          const { data: userData } = await supabase.auth.getUser();
          const reverseRows = orderItems.map((item) => ({
            product_id: item.product_id,
            movement_type: "return" as const,
            quantity: item.quantity,
            from_location_id: null,
            to_location_id: defaultLocId,
            unit_cost: null,
            reason: `Order deleted ${deleteOrderId.slice(0, 8)}`,
            reference_type: "order_delete",
            reference_id: deleteOrderId,
            created_by: userData.user?.id ?? null,
          }));
          await supabase.from("stock_movements").insert(reverseRows);
        }
      }

      // Delete order items
      const { error: itemsError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", deleteOrderId);
      
      if (itemsError) throw itemsError;

      // Delete the order
      const { error: orderError } = await supabase
        .from("orders")
        .delete()
        .eq("id", deleteOrderId);
      
      if (orderError) throw orderError;

      const deletedOrder = orders.find((o) => o.id === deleteOrderId);
      await logAudit({
        action: "delete",
        entityType: "order",
        entityId: deleteOrderId,
        entityLabel: deleteOrderId.slice(0, 8),
        summary: `Deleted order${deletedOrder ? ` ($${Number(deletedOrder.total).toFixed(2)})` : ""}; stock restored`,
        metadata: deletedOrder ? { total: deletedOrder.total, status: deletedOrder.status } : undefined,
      });

      toast({ title: "Success", description: "Order deleted and stock restored" });
      setDeleteOrderId(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
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

  const handleCreateInlineSalon = async () => {
    if (!newSalonData.name) {
      toast({
        title: "Error",
        description: "Salon name is required",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingSalon(true);
    try {
      const { data, error } = await supabase
        .from('salons')
        .insert([{
          name: newSalonData.name,
          contact_name: newSalonData.contact_name || null,
          phone: newSalonData.phone || null,
          email: newSalonData.email || null,
          address: newSalonData.address || null,
          city: newSalonData.city || null,
        }])
        .select()
        .single();

      if (error) throw error;

      // Refresh salons and select the new one
      await fetchData();
      setFormData({ ...formData, salon_id: data.id });
      setShowNewSalonForm(false);
      setNewSalonData({ name: "", contact_name: "", phone: "", email: "", address: "", city: "" });
      
      toast({
        title: "Success",
        description: "Salon created and selected",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreatingSalon(false);
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
      const subtotal = calculateTotal();
      const discountInput = parseFloat(formData.discount) || 0;
      const discountAmount = Math.min(
        subtotal,
        Math.max(0, formData.discountType === "percent" ? subtotal * (discountInput / 100) : discountInput)
      );
      const discountedSubtotal = Math.max(0, subtotal - discountAmount);
      const tax = calculateTax(discountedSubtotal);
      const total = discountedSubtotal + tax;

      // === OFFLINE PATH: queue locally and bail out ===
      if (!isOnline()) {
        const selectedProfile = profiles.find((p) => p.id === formData.profile_id);
        const selectedSalon = salons.find((s) => s.id === formData.salon_id);
        const customerLabel = selectedProfile?.full_name || selectedSalon?.name || "Walk-in";

        await enqueueOrder({
          salon_id: formData.salon_id || null,
          profile_id: formData.profile_id || null,
          notes: formData.notes || null,
          technician_name: formData.technician_name || null,
          created_by: user?.id ?? null,
          status: "Draft",
          subtotal,
          tax,
          total,
          customer_label: customerLabel,
          items: orderItems.map((it) => {
            const p = products.find((pp) => pp.id === it.product_id);
            return {
              product_id: it.product_id,
              product_name: p?.name,
              sku: p?.sku,
              quantity: it.quantity,
              unit_price: it.unit_price,
            };
          }),
        });
        notifyQueueChanged();

        toast({
          title: "Order saved offline",
          description: "It will sync automatically when you're back online.",
        });
        setIsDialogOpen(false);
        setFormData({ salon_id: "", profile_id: "", notes: "", technician_name: "", discount: "", discountType: "amount" });
        setDetectedReferrer(null);
        setOrderItems([]);
        setShowOrderDetails(false);
        return;
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            salon_id: formData.salon_id || null,
            profile_id: formData.profile_id || null,
            notes: formData.notes || null,
            technician_name: formData.technician_name || null,
            created_by: user?.id,
            status: "Draft",
            subtotal,
            tax,
            total,
            discount_amount: discountAmount > 0 ? discountAmount : null,
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

      // Deduct stock from the default (Main) warehouse via stock_movements.
      // The DB trigger keeps products.stock_on_hand in sync.
      const defaultLocId = await getDefaultLocationId();
      if (defaultLocId) {
        const { data: userData } = await supabase.auth.getUser();
        const movementRows = orderItems.map((item) => ({
          product_id: item.product_id,
          movement_type: "sale" as const,
          quantity: item.quantity,
          from_location_id: defaultLocId,
          to_location_id: null,
          unit_cost: item.unit_price,
          reason: `Order ${order.id.slice(0, 8)}`,
          reference_type: "order",
          reference_id: order.id,
          created_by: userData.user?.id ?? null,
        }));
        const { error: moveErr } = await supabase
          .from("stock_movements")
          .insert(movementRows);
        if (moveErr) throw moveErr;
      }

      // Get customer/salon info for notification
      const selectedProfile = profiles.find(p => p.id === formData.profile_id);
      const selectedSalon = salons.find(s => s.id === formData.salon_id);
      
      // Prepare items with product details for Telegram notification
      const notificationItems = orderItems.map(item => {
        const product = products.find(p => p.id === item.product_id);
        return {
          product_name: product?.name || 'Unknown Product',
          sku: product?.sku || '',
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.quantity * item.unit_price,
        };
      });

      // Send Telegram notification
      try {
        console.log('=== TELEGRAM NOTIFICATION (Orders Page) ===');
        const notificationPayload = {
          orderId: order.id,
          orderData: {
            customer_name: selectedProfile?.full_name || selectedSalon?.name || 'Walk-in Customer',
            customer_email: selectedProfile?.email || selectedSalon?.email || 'N/A',
            customer_phone: selectedProfile?.phone || selectedSalon?.phone || null,
            customer_address: selectedSalon?.address || selectedProfile ? 'Customer Order' : 'In-Store Pickup',
            items: notificationItems,
            subtotal,
            total,
            notes: formData.notes || null,
            technician_name: formData.technician_name || null,
          }
        };
        
        console.log('Sending notification:', JSON.stringify(notificationPayload, null, 2));
        
        const { data: notifyData, error: notifyError } = await supabase.functions.invoke('notify-new-order', {
          body: notificationPayload
        });
        
        if (notifyError) {
          console.error('Telegram notification error:', notifyError);
        } else {
          console.log('Telegram notification sent:', notifyData);
        }
      } catch (notifyErr) {
        console.error('Telegram notification exception:', notifyErr);
      }

      // Create referral commission if customer has a referrer
      if (detectedReferrer && formData.profile_id) {
        const commissionAmount = subtotal * (detectedReferrer.commission_rate / 100);
        try {
          await supabase.from("referral_commissions").insert([{
            order_id: order.id,
            referrer_id: detectedReferrer.id,
            customer_id: formData.profile_id,
            order_subtotal: subtotal,
            commission_rate: detectedReferrer.commission_rate,
            commission_amount: commissionAmount,
            status: "pending",
          }]);
          // Update referrer cached stats
          const { data: refData } = await supabase.from("referrers").select("total_revenue, total_commission").eq("id", detectedReferrer.id).single();
          if (refData) {
            await supabase.from("referrers").update({
              total_revenue: Number(refData.total_revenue) + subtotal,
              total_commission: Number(refData.total_commission) + commissionAmount,
            }).eq("id", detectedReferrer.id);
          }
        } catch (commErr) {
          console.error("Failed to create referral commission:", commErr);
        }
      }

      // Audit log
      const customerLabel = selectedProfile?.full_name || selectedSalon?.name || "Walk-in";
      await logAudit({
        action: "create",
        entityType: "order",
        entityId: order.id,
        entityLabel: order.id.slice(0, 8),
        summary: `Created order for ${customerLabel} (${orderItems.length} items, $${total.toFixed(2)})`,
        metadata: {
          customer: customerLabel,
          item_count: orderItems.length,
          subtotal,
          total,
        },
      });

      toast({ title: "Success", description: "Order created and stock updated" });
      setIsDialogOpen(false);
      setFormData({ salon_id: "", profile_id: "", notes: "", technician_name: "", discount: "", discountType: "amount" });
      setDetectedReferrer(null);
      setOrderItems([]);
      setShowOrderDetails(false);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };



  // Memoize active and completed orders partition
  const { activeOrders, completedOrders } = useMemo(() => ({
    activeOrders: orders.filter((order) => order.status !== "Delivered" && order.status !== "Paid"),
    completedOrders: orders.filter((order) => order.status === "Delivered" || order.status === "Paid"),
  }), [orders]);

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

  // Memoize filter function to avoid recreating on every render
  const filterOrders = useCallback((order: Order) => {
    const normalizedSearch = searchTerm.toLowerCase();
    const name = order.salons?.name || order.customer_name || '';
    const matchesSearch = name.toLowerCase().includes(normalizedSearch);
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    // Date range filter - compare date strings to avoid timezone issues
    const orderDateStr = order.order_date; // "YYYY-MM-DD" format
    const matchesDateFrom = !dateFrom || orderDateStr >= format(dateFrom, 'yyyy-MM-dd');
    const matchesDateTo = !dateTo || orderDateStr <= format(dateTo, 'yyyy-MM-dd');
    
    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
  }, [searchTerm, statusFilter, dateFrom, dateTo]);

  // Memoize filtered orders
  const { filteredActiveOrders, filteredCompletedOrders, allFilteredOrders } = useMemo(() => {
    const filteredActive = activeOrders.filter(filterOrders);
    const filteredCompleted = completedOrders.filter(filterOrders);
    return {
      filteredActiveOrders: filteredActive,
      filteredCompletedOrders: filteredCompleted,
      allFilteredOrders: [...filteredActive, ...filteredCompleted],
    };
  }, [activeOrders, completedOrders, filterOrders]);

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
      setFormData({ salon_id: order.salon_id || '', profile_id: '', notes: `Reorder from ${new Date(order.order_date).toLocaleDateString()}`, technician_name: order.technician_name || '', discount: "", discountType: "amount" });
      setShowOrderDetails(false);
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

      const ord = orders.find((o) => o.id === orderId);
      await logAudit({
        action: "update",
        entityType: "order",
        entityId: orderId,
        entityLabel: orderId.slice(0, 8),
        summary: `Status changed${ord ? ` from ${ord.status}` : ""} → ${newStatus}`,
        metadata: { status_before: ord?.status, status_after: newStatus },
      });

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

      await logAudit({
        action: "update",
        entityType: "order",
        entityLabel: `${selectedOrders.size} orders`,
        summary: `Bulk status update → ${bulkStatus} (${selectedOrders.size} orders)`,
        metadata: { status_after: bulkStatus, count: selectedOrders.size, ids: Array.from(selectedOrders) },
      });

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
    const itemsHtml = (order.order_items || []).map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.products?.name || 'Unknown'}${item.products?.sku ? `<br><span style="font-size:11px;color:#888;">${item.products.sku}</span>` : ''}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.unit_price.toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(item.quantity * item.unit_price).toFixed(2)}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Packing Slip - Order ${order.id.slice(0, 8)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #000; background: #fff; }
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
          @page { margin: 0; }
          @media print { body { padding: 20px; } .no-print { display: none !important; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">
            <img src="${NERA_PACKING_LOGO}" alt="NERA Beauty" style="height: 80px; width: auto;" />
          </div>
          <div class="order-info">
            <div class="order-id">Order #${order.id.slice(0, 8).toUpperCase()}</div>
            <div class="date">${new Date(order.order_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div class="status-badge status-${order.status}" style="margin-top: 6px;">${order.status}</div>
            ${(order.discount_amount ?? 0) > 0 ? `<div style="margin-top: 6px; color: #059669; font-weight: 600;">Discounted order −$${Number(order.discount_amount).toFixed(2)}</div>` : ''}
          </div>
        </div>

        const salonDetails = salons.find(s => s.id === order.salon_id);
        const shipName = order.salons?.name || order.customer_name || '—';
        const shipAddress = salonDetails?.address || order.customer_address || '';

        <div class="addresses">
          <div class="address-block">
            <h3>Ship To</h3>
            <p>${shipName}</p>
            ${shipAddress ? `<p>${shipAddress}</p>` : ''}
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
          ${(order.discount_amount ?? 0) > 0 ? `<div class="totals-row" style="color:#059669;font-weight:600;"><span>Discount</span><span>−$${Number(order.discount_amount).toFixed(2)}</span></div>` : ''}
          <div class="totals-row"><span>Tax</span><span>$${order.tax.toFixed(2)}</span></div>
          ${((order.shipping ?? 0) > 0 || order.shipping_zone) ? `<div class="totals-row"><span>Shipping${order.shipping_zone ? ` (${order.shipping_zone})` : ''}</span><span>${(order.shipping ?? 0) > 0 ? `$${(order.shipping ?? 0).toFixed(2)}` : 'FREE'}</span></div>` : ''}
          <div class="totals-row total"><span>Total</span><span>$${order.total.toFixed(2)}</span></div>
        </div>

        ${order.notes ? `<div class="notes"><h3>Notes</h3><p>${order.notes}</p></div>` : ''}

        <div style="text-align:center;margin-top:24px;" class="no-print">
          <button onclick="window.close()" style="padding:10px 24px;font-size:14px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;margin-right:8px;">← Close</button>
          <button onclick="window.print()" style="padding:10px 24px;font-size:14px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;">🖨 Print</button>
        </div>
      </body>
      </html>
    `;

    // Use a Blob URL instead of about:blank — prevents Safari/Chrome from
    // auto-closing the new tab when document.write races with the navigation.
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
      URL.revokeObjectURL(url);
      toast({ title: "Popup blocked", description: "Please allow popups to print the packing slip.", variant: "destructive" });
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const buildReceiptText = (order: Order) => {
    const itemsText = (order.order_items || [])
      .map(it => `• ${it.products?.name || 'Item'} × ${it.quantity} — $${(it.quantity * it.unit_price).toFixed(2)}`)
      .join('\n');
    const orderNo = order.id.slice(0, 8).toUpperCase();
    const dateStr = new Date(order.order_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const recipient = order.customer_name || order.salons?.name || 'Customer';
    const subject = `Receipt — Order #${orderNo}`;
    const body =
`Hi ${recipient},

Here is your receipt from NERA Beauty.

Order #${orderNo}
Date: ${dateStr}
Status: ${order.status}

${itemsText}

Subtotal: $${order.subtotal.toFixed(2)}${(order.discount_amount ?? 0) > 0 ? `\nDiscount: −$${Number(order.discount_amount).toFixed(2)}` : ''}
Tax: $${order.tax.toFixed(2)}
Total: $${order.total.toFixed(2)}${(order.discount_amount ?? 0) > 0 ? `  (you saved $${Number(order.discount_amount).toFixed(2)})` : ''}

Thank you!`;
    return { subject, body };
  };

  const shareOrder = async (order: Order, channel: 'native' | 'email' | 'sms' | 'whatsapp' | 'copy') => {
    const { subject, body } = buildReceiptText(order);

    if (channel === 'native' && typeof (navigator as any).share === 'function') {
      try {
        await (navigator as any).share({ title: subject, text: body });
      } catch { /* user cancelled */ }
      return;
    }
    if (channel === 'email') {
      const to = order.customer_email ? encodeURIComponent(order.customer_email) : '';
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }
    if (channel === 'sms') {
      const to = order.customer_phone ? encodeURIComponent(order.customer_phone.replace(/\s+/g, '')) : '';
      window.location.href = `sms:${to}?&body=${encodeURIComponent(body)}`;
      return;
    }
    if (channel === 'whatsapp') {
      const phone = (order.customer_phone || '').replace(/[^\d]/g, '');
      const url = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(body)}`
        : `https://wa.me/?text=${encodeURIComponent(body)}`;
      window.open(url, '_blank');
      return;
    }
    if (channel === 'copy') {
      try {
        await navigator.clipboard.writeText(body);
        toast({ title: "Copied", description: "Receipt copied to clipboard." });
      } catch {
        toast({ title: "Copy failed", description: "Couldn't copy to clipboard.", variant: "destructive" });
      }
    }
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
                onClick={async (e) => {
                  e.stopPropagation();
                  if (status === order.status) return;
                  // If this order is among multiple selected, update all selected at once
                  if (selectedOrders.size > 1 && selectedOrders.has(order.id)) {
                    const ids = Array.from(selectedOrders);
                    try {
                      const { error } = await supabase
                        .from("orders")
                        .update({ status: status as any })
                        .in("id", ids);
                      if (error) throw error;
                      await logAudit({
                        action: "update",
                        entityType: "order",
                        entityLabel: `${ids.length} orders`,
                        summary: `Bulk status update → ${status} (${ids.length} orders)`,
                        metadata: { status_after: status, count: ids.length, ids },
                      });
                      toast({ title: "Success", description: `${ids.length} orders updated to ${status}` });
                      setSelectedOrders(new Set());
                      fetchData();
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message, variant: "destructive" });
                    }
                  } else {
                    handleUpdateOrderStatus(order.id, status);
                  }
                }}
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all whitespace-nowrap
                  ${isCurrent && status === 'Confirmed' ? 'bg-blue-500 text-white' : ''}
                  ${isCurrent && status === 'Shipped' ? 'bg-purple-500 text-white' : ''}
                  ${isCurrent && status === 'Delivered' ? 'bg-green-500 text-white' : ''}
                  ${isCompleted && !isCurrent ? 'bg-green-500/20 text-green-600 dark:text-green-400' : ''}
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
      </div>

      <Sheet open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <SheetContent className="w-full sm:max-w-[min(90vw,42rem)] flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>Create New Order</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreateOrder} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 flex flex-col">


              <div className="space-y-3 flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between">
                  <Label>Products *</Label>
                  {orderItems.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCartOnly(!showCartOnly)}
                      className="text-muted-foreground"
                    >
                      {showCartOnly ? (
                        <>
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Back to products
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="h-4 w-4 mr-1" />
                          Edit cart
                        </>
                      )}
                    </Button>
                  )}
                </div>
                
                {showCartOnly ? (
                  /* Cart View */
                  <div className="space-y-3">
                    {orderItems.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-30" />
                        <p>No products selected</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {orderItems.map((item) => {
                          const product = products.find(p => p.id === item.product_id);
                          if (!product) return null;
                          const imageUrl = product.image_url || product.product_images?.[0]?.image_url;
                          return (
                            <div key={item.product_id} className="flex flex-col sm:flex-row gap-3 p-3 bg-muted/50 rounded-lg">
                              {/* Product info row */}
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="h-14 w-14 rounded bg-muted flex-shrink-0 overflow-hidden">
                                  {imageUrl ? (
                                    <img src={imageUrl} alt={product.name} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">—</div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">{product.name}</div>
                                  <div className="text-xs text-muted-foreground">{product.sku}</div>
                                  <div className="text-sm text-primary font-medium">${item.unit_price.toFixed(2)} each</div>
                                </div>
                              </div>
                              
                              {/* Controls row */}
                              <div className="flex items-center justify-between sm:justify-end gap-3 pl-[68px] sm:pl-0">
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-9 w-9"
                                    onClick={() => {
                                      if (item.quantity <= 1) {
                                        setOrderItems(orderItems.filter(i => i.product_id !== item.product_id));
                                      } else {
                                        setOrderItems(orderItems.map(i =>
                                          i.product_id === item.product_id ? { ...i, quantity: i.quantity - 1 } : i
                                        ));
                                      }
                                    }}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <span className="w-10 text-center font-semibold text-lg">{item.quantity}</span>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-9 w-9"
                                    onClick={() => {
                                      setOrderItems(orderItems.map(i =>
                                        i.product_id === item.product_id ? { ...i, quantity: i.quantity + 1 } : i
                                      ));
                                    }}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="font-bold text-base w-20 text-right">
                                  ${(item.unit_price * item.quantity).toFixed(2)}
                                </div>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-9 w-9 text-destructive hover:text-destructive flex-shrink-0"
                                  onClick={() => setOrderItems(orderItems.filter(i => i.product_id !== item.product_id))}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Product Browser */
                  <ProductBrowser
                    products={products}
                    orderItems={orderItems}
                    onAddProduct={(product) => {
                      const existingIndex = orderItems.findIndex(item => item.product_id === product.id);
                      if (existingIndex >= 0) {
                        const updated = [...orderItems];
                        updated[existingIndex].quantity += 1;
                        setOrderItems(updated);
                      } else {
                        setOrderItems([...orderItems, {
                          product_id: product.id,
                          quantity: 1,
                          unit_price: product.price_usd,
                        }]);
                      }
                    }}
                    onUpdateQuantity={(productId, quantity) => {
                      const updated = orderItems.map(item =>
                        item.product_id === productId ? { ...item, quantity } : item
                      );
                      setOrderItems(updated);
                    }}
                    onRemoveProduct={(productId) => {
                      setOrderItems(orderItems.filter(item => item.product_id !== productId));
                    }}
                  />
                )}
              </div>

            </div>

            {/* Sticky footer */}
            <div className="border-t px-6 py-3 bg-background space-y-3">

              {/* Collapsible order details (Customer / Salon / Tech / Notes / Discount) */}
              <Collapsible open={showOrderDetails || showNewUserForm || showNewSalonForm} onOpenChange={(open) => {
                if (!open) {
                  setShowOrderDetails(false);
                  setShowNewUserForm(false);
                  setShowNewSalonForm(false);
                } else {
                  setShowOrderDetails(true);
                }
              }}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5" />
                      Order details
                      {(formData.profile_id || formData.salon_id || formData.technician_name || formData.notes || formData.discount) && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          {(formData.profile_id ? 1 : 0) + (formData.salon_id ? 1 : 0) + (formData.technician_name ? 1 : 0) + (formData.notes ? 1 : 0) + (formData.discount ? 1 : 0)} set
                        </Badge>
                      )}
                    </span>
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", (showOrderDetails || showNewUserForm || showNewSalonForm) && "rotate-90")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="profile_id" className="text-xs text-muted-foreground">Customer (optional)</Label>
                      <Popover open={customerComboOpen} onOpenChange={setCustomerComboOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={customerComboOpen}
                            className="w-full justify-between font-normal h-9 text-sm"
                          >
                            {formData.profile_id
                              ? profiles.find(p => p.id === formData.profile_id)?.full_name || "Walk-in (no customer)"
                              : "Walk-in (no customer)"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search customers..." />
                            <CommandList>
                              <CommandEmpty>No customer found.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value="no-customer"
                                  onSelect={() => {
                                    setFormData({ ...formData, profile_id: "" });
                                    setCustomerComboOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", !formData.profile_id ? "opacity-100" : "opacity-0")} />
                                  <span className="text-muted-foreground">Walk-in (no customer)</span>
                                </CommandItem>
                                <CommandItem
                                  value="add-new-customer"
                                  onSelect={() => {
                                    setShowNewUserForm(true);
                                    setCustomerComboOpen(false);
                                  }}
                                >
                                  <Plus className="mr-2 h-4 w-4 text-primary" />
                                  <span className="text-primary">Add New Customer</span>
                                </CommandItem>
                                {profiles.map((profile) => (
                                  <CommandItem
                                    key={profile.id}
                                    value={`${profile.full_name} ${profile.email} ${profile.phone || ""}`}
                                    onSelect={() => {
                                      setFormData({ ...formData, profile_id: profile.id });
                                      setCustomerComboOpen(false);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", formData.profile_id === profile.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col">
                                      <span className="font-medium">{profile.full_name}</span>
                                      <span className="text-xs text-muted-foreground">{profile.email}</span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="salon_id" className="text-xs text-muted-foreground">Salon</Label>
                      <Popover open={salonComboOpen} onOpenChange={setSalonComboOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={salonComboOpen}
                            className="w-full justify-between font-normal h-9 text-sm"
                          >
                            {formData.salon_id
                              ? salons.find(s => s.id === formData.salon_id)?.name || "No salon"
                              : "No salon"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search salons..." />
                            <CommandList>
                              <CommandEmpty>No salon found.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value="no-salon"
                                  onSelect={() => {
                                    setFormData({ ...formData, salon_id: "" });
                                    setSalonComboOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", !formData.salon_id ? "opacity-100" : "opacity-0")} />
                                  <span className="text-muted-foreground">No salon</span>
                                </CommandItem>
                                <CommandItem
                                  value="add-new-salon"
                                  onSelect={() => {
                                    setShowNewSalonForm(true);
                                    setSalonComboOpen(false);
                                  }}
                                >
                                  <Plus className="mr-2 h-4 w-4 text-primary" />
                                  <span className="text-primary">Add New Salon</span>
                                </CommandItem>
                                {salons.map((salon) => (
                                  <CommandItem
                                    key={salon.id}
                                    value={salon.name}
                                    onSelect={() => {
                                      setFormData({ ...formData, salon_id: salon.id });
                                      setSalonComboOpen(false);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", formData.salon_id === salon.id ? "opacity-100" : "opacity-0")} />
                                    {salon.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Referrer auto-detection indicator */}
                    {detectedReferrer && (
                      <div className="sm:col-span-2 bg-muted/50 border rounded-md p-3 flex items-center gap-2">
                        <Share2 className="h-4 w-4 text-primary flex-shrink-0" />
                        <div className="text-sm">
                          <span className="font-medium">Referrer detected:</span>{" "}
                          <span>{detectedReferrer.name}</span>{" "}
                          <span className="text-muted-foreground">({detectedReferrer.commission_rate}% commission = ${(calculateTotal() * detectedReferrer.commission_rate / 100).toFixed(2)})</span>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label htmlFor="technician_name" className="text-xs text-muted-foreground">Technician</Label>
                      <Input
                        id="technician_name"
                        value={formData.technician_name}
                        onChange={(e) => setFormData({ ...formData, technician_name: e.target.value })}
                        placeholder="Tech name..."
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="notes" className="text-xs text-muted-foreground">Notes</Label>
                      <Input
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Order notes..."
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="discount" className="text-xs text-muted-foreground">Discount</Label>
                      <div className="flex gap-1">
                        <Input
                          id="discount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.discount}
                          onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                          placeholder="0"
                          className="h-9 text-sm"
                        />
                        <div className="flex rounded-md border overflow-hidden h-9 flex-shrink-0">
                          <button
                            type="button"
                            className={`px-3 text-xs ${formData.discountType === "amount" ? "bg-primary text-primary-foreground" : "bg-background"}`}
                            onClick={() => setFormData({ ...formData, discountType: "amount" })}
                          >$</button>
                          <button
                            type="button"
                            className={`px-3 text-xs ${formData.discountType === "percent" ? "bg-primary text-primary-foreground" : "bg-background"}`}
                            onClick={() => setFormData({ ...formData, discountType: "percent" })}
                          >%</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {showNewSalonForm && (
                    <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
                      <div className="flex items-center justify-between">
                        <Label className="font-semibold">New Salon Details</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewSalonForm(false)}>
                          Cancel
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="new_salon_name">Salon Name *</Label>
                          <Input
                            id="new_salon_name"
                            value={newSalonData.name}
                            onChange={(e) => setNewSalonData({ ...newSalonData, name: e.target.value })}
                            placeholder="Beauty Salon"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="new_salon_contact">Contact Name</Label>
                          <Input
                            id="new_salon_contact"
                            value={newSalonData.contact_name}
                            onChange={(e) => setNewSalonData({ ...newSalonData, contact_name: e.target.value })}
                            placeholder="Jane Doe"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="new_salon_phone">Phone</Label>
                          <Input
                            id="new_salon_phone"
                            type="tel"
                            value={newSalonData.phone}
                            onChange={(e) => setNewSalonData({ ...newSalonData, phone: e.target.value })}
                            placeholder="+1 234 567 8900"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="new_salon_email">Email</Label>
                          <Input
                            id="new_salon_email"
                            type="email"
                            value={newSalonData.email}
                            onChange={(e) => setNewSalonData({ ...newSalonData, email: e.target.value })}
                            placeholder="salon@example.com"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="new_salon_address">Address</Label>
                          <Input
                            id="new_salon_address"
                            value={newSalonData.address}
                            onChange={(e) => setNewSalonData({ ...newSalonData, address: e.target.value })}
                            placeholder="123 Main St"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="new_salon_city">City</Label>
                          <Input
                            id="new_salon_city"
                            value={newSalonData.city}
                            onChange={(e) => setNewSalonData({ ...newSalonData, city: e.target.value })}
                            placeholder="New York"
                          />
                        </div>
                      </div>
                      <Button 
                        type="button" 
                        size="sm" 
                        onClick={handleCreateInlineSalon}
                        disabled={isCreatingSalon || !newSalonData.name}
                      >
                        {isCreatingSalon ? "Creating..." : "Create & Select Salon"}
                      </Button>
                    </div>
                  )}

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
                </CollapsibleContent>
              </Collapsible>

              {/* Cart summary row */}
              {orderItems.length > 0 && (() => {
                const sub = calculateTotal();
                const dInput = parseFloat(formData.discount) || 0;
                const dAmt = Math.min(sub, Math.max(0, formData.discountType === "percent" ? sub * (dInput / 100) : dInput));
                const discounted = Math.max(0, sub - dAmt);
                const taxAmt = calculateTax(discounted);
                return (
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {orderItems.length} product(s)
                    </div>
                    <div className="text-right">
                      {dAmt > 0 && (
                        <div className="text-xs text-emerald-500">
                          Discount{formData.discountType === "percent" ? ` (${dInput}%)` : ""}: −${dAmt.toFixed(2)}
                        </div>
                      )}
                      {taxRate > 0 && (
                        <div className="text-xs text-muted-foreground">Tax ({taxRate}%): ${taxAmt.toFixed(2)}</div>
                      )}
                      {dAmt > 0 && (
                        <div className="text-xs text-muted-foreground line-through">${(sub + calculateTax(sub)).toFixed(2)}</div>
                      )}
                      <div className="font-bold text-lg">${(discounted + taxAmt).toFixed(2)}</div>
                    </div>
                  </div>
                );
              })()}
            </div>


            {/* Sticky Actions */}
            <div className="flex justify-end gap-2 px-6 py-3 border-t bg-background pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setShowCartOnly(false); setShowOrderDetails(false); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={orderItems.length === 0}>
                Create Order
              </Button>
            </div>
          </form>

        </SheetContent>
      </Sheet>

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
                    <div className="font-medium mt-1 break-all">
                      {viewOrder.customer_email ? (
                        <a href={`mailto:${viewOrder.customer_email}`} className="text-primary hover:underline">
                          {viewOrder.customer_email}
                        </a>
                      ) : "—"}
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <div className="font-medium mt-1">
                      {viewOrder.customer_phone ? (
                        <a href={`tel:${viewOrder.customer_phone.replace(/\s+/g, '')}`} className="text-primary hover:underline">
                          {viewOrder.customer_phone}
                        </a>
                      ) : "—"}
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <Label className="text-xs text-muted-foreground">Address</Label>
                    <div className="font-medium mt-1">
                      {viewOrder.customer_address ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(viewOrder.customer_address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {viewOrder.customer_address}
                        </a>
                      ) : "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Salon Info */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Salon</h3>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {viewOrder.salon_id
                        ? salons.find(s => s.id === viewOrder.salon_id)?.name || viewOrder.salons?.name || "Select salon"
                        : "No salon"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search salons..." />
                      <CommandList>
                        <CommandEmpty>No salon found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="no-salon"
                            onSelect={async () => {
                              try {
                                const { error } = await supabase
                                  .from("orders")
                                  .update({ salon_id: null })
                                  .eq("id", viewOrder.id);
                                if (error) throw error;
                                setViewOrder({ ...viewOrder, salon_id: null, salons: null });
                                fetchData();
                                toast({ title: "Updated", description: "Salon removed" });
                              } catch (err: any) {
                                toast({ title: "Error", description: err.message, variant: "destructive" });
                              }
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", !viewOrder.salon_id ? "opacity-100" : "opacity-0")} />
                            No salon
                          </CommandItem>
                          {salons.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={async () => {
                                try {
                                  const { error } = await supabase
                                    .from("orders")
                                    .update({ salon_id: s.id })
                                    .eq("id", viewOrder.id);
                                  if (error) throw error;
                                  setViewOrder({ ...viewOrder, salon_id: s.id, salons: { name: s.name } });
                                  fetchData();
                                  toast({ title: "Updated", description: `Salon set to ${s.name}` });
                                } catch (err: any) {
                                  toast({ title: "Error", description: err.message, variant: "destructive" });
                                }
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", viewOrder.salon_id === s.id ? "opacity-100" : "opacity-0")} />
                              {s.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Order Items */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Order Items</h3>
                <div className="space-y-2">
                  {(viewOrder.order_items || []).map((it) => {
                    const productImage = it.products?.image_url || 
                      (it.products?.product_images && it.products.product_images[0]?.image_url) || 
                      null;
                    return (
                      <div key={it.id} className="flex justify-between items-center bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          {productImage ? (
                            <img 
                              src={productImage} 
                              alt={it.products?.name || 'Product'} 
                              className="w-10 h-10 rounded-md object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                              <Package className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <span className="font-medium">{it.products?.name}</span>
                            <span className="text-muted-foreground ml-2">× {it.quantity}</span>
                            {it.products?.sku && (
                              <span className="text-xs text-muted-foreground/60 ml-2">({it.products.sku})</span>
                            )}
                          </div>
                        </div>
                        <span className="font-semibold">${(it.quantity * it.unit_price).toFixed(2)}</span>
                      </div>
                    );
                  })}
                  {(!viewOrder.order_items || viewOrder.order_items.length === 0) && (
                    <div className="text-muted-foreground text-center py-4">No items in this order</div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Notes</h3>
                <textarea
                  className="w-full bg-muted/50 rounded-lg p-3 text-sm border-0 resize-none focus:ring-1 focus:ring-primary outline-none min-h-[60px]"
                  defaultValue={viewOrder.notes || ""}
                  placeholder="Add notes..."
                  onBlur={async (e) => {
                    const newNotes = e.target.value.trim();
                    if (newNotes === (viewOrder.notes || "")) return;
                    try {
                      const { error } = await supabase
                        .from("orders")
                        .update({ notes: newNotes || null })
                        .eq("id", viewOrder.id);
                      if (error) throw error;
                      setViewOrder({ ...viewOrder, notes: newNotes || null });
                      fetchData();
                      toast({ title: "Updated", description: "Notes saved" });
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message, variant: "destructive" });
                    }
                  }}
                />
              </div>

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
                  {((viewOrder.shipping ?? 0) > 0 || viewOrder.shipping_zone) && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Shipping{viewOrder.shipping_zone ? ` (${viewOrder.shipping_zone})` : ''}
                      </span>
                      <span>
                        {(viewOrder.shipping ?? 0) > 0
                          ? `$${(viewOrder.shipping ?? 0).toFixed(2)}`
                          : 'FREE'}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-lg border-t pt-2">
                    <span>Total</span>
                    <span className="text-primary">${viewOrder.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex flex-wrap justify-end gap-2 pt-4 border-t">
                {editedOrderIds.has(viewOrder.id) && (
                  <Button
                    variant="outline"
                    onClick={() => setHistoryOrderId(viewOrder.id)}
                  >
                    <History className="h-4 w-4 mr-2" />
                    View History
                  </Button>
                )}
                <Button
                  variant="default"
                  onClick={() => {
                    setEditOrder(viewOrder);
                    setViewOrder(null);
                  }}
                >
                  Edit Order
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setReturnOrder(viewOrder);
                    setViewOrder(null);
                  }}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Return Items
                </Button>
                <Button variant="outline" onClick={() => printPackingSlip(viewOrder)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Packing Slip
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Share2 className="h-4 w-4 mr-2" />
                      Share Receipt
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 bg-popover z-50">
                    <DropdownMenuLabel>Send receipt via</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {typeof (navigator as any).share === 'function' && (
                      <DropdownMenuItem onClick={() => shareOrder(viewOrder, 'native')}>
                        <Share2 className="h-4 w-4 mr-2" />
                        Device share…
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => shareOrder(viewOrder, 'email')}>
                      <Mail className="h-4 w-4 mr-2" />
                      Email{viewOrder.customer_email ? ` (${viewOrder.customer_email})` : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => shareOrder(viewOrder, 'sms')}>
                      <Phone className="h-4 w-4 mr-2" />
                      SMS{viewOrder.customer_phone ? ` (${viewOrder.customer_phone})` : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => shareOrder(viewOrder, 'whatsapp')}>
                      <MessageCircle className="h-4 w-4 mr-2" />
                      WhatsApp
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => shareOrder(viewOrder, 'copy')}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy to clipboard
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EditOrderDialog
        order={editOrder as any}
        open={!!editOrder}
        onOpenChange={(o) => !o && setEditOrder(null)}
        products={products as any}
        salons={salons as any}
        onSaved={() => {
          fetchData();
          queryClient.invalidateQueries({ queryKey: ["products"] });
        }}
      />

      <OrderHistoryDialog
        orderId={historyOrderId}
        open={!!historyOrderId}
        onOpenChange={(o) => !o && setHistoryOrderId(null)}
      />

      <ReturnDialog
        order={returnOrder as any}
        open={!!returnOrder}
        onOpenChange={(o) => !o && setReturnOrder(null)}
        onCompleted={() => {
          fetchData();
          queryClient.invalidateQueries({ queryKey: ["products"] });
        }}
      />

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
              <div className="grid grid-cols-2 gap-3">
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
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))'
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11 min-h-[44px]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button className="h-11 min-h-[44px] flex-1 sm:flex-none" onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Order
                </Button>
                <Popover open={isTaxSettingsOpen} onOpenChange={(open) => {
                  setIsTaxSettingsOpen(open);
                  if (open) setEditTaxRate(String(taxSettings?.tax_rate ?? 0));
                }}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-11 min-h-[44px] gap-2">
                      <Settings className="h-4 w-4" />
                      <span className="hidden sm:inline">Tax: {taxRate}%</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 z-50">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Sales Tax Rate</h4>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          max="100"
                          value={editTaxRate}
                          onChange={(e) => setEditTaxRate(e.target.value)}
                          className="h-9"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Active</Label>
                        <Switch
                          checked={taxSettings?.is_active ?? true}
                          onCheckedChange={async (checked) => {
                            const result = await updateTaxSettings({ is_active: checked });
                            if (!result?.error) toast({ title: "Tax " + (checked ? "enabled" : "disabled") });
                          }}
                        />
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                          const rate = parseFloat(editTaxRate);
                          if (isNaN(rate) || rate < 0 || rate > 100) {
                            toast({ title: "Invalid rate", variant: "destructive" });
                            return;
                          }
                          const result = await updateTaxSettings({ tax_rate: rate });
                          if (!result?.error) {
                            toast({ title: "Tax rate updated to " + rate + "%" });
                            setIsTaxSettingsOpen(false);
                          }
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {selectedOrders.size > 0 && (
                  <Button 
                    variant="default" 
                    className="h-11 min-h-[44px] flex-1 sm:flex-none"
                    onClick={() => setBulkStatusDialogOpen(true)}
                  >
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Update {selectedOrders.size}
                  </Button>
                )}
                <Button variant="outline" className="h-11 min-h-[44px]" onClick={() => setIsMapOpen(true)}>
                  <Map className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Map</span>
                </Button>
                <Button variant="outline" className="h-11 min-h-[44px]" onClick={exportOrders}>
                  <Download className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </div>
            </div>
            
            {/* Date Range Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">Date:</span>
              
              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1">
                <Button
                  variant={dateFrom && dateTo && format(dateFrom, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && format(dateTo, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => {
                    const today = new Date();
                    setDateFrom(startOfDay(today));
                    setDateTo(endOfDay(today));
                  }}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => {
                    const today = new Date();
                    setDateFrom(subDays(today, 6));
                    setDateTo(endOfDay(today));
                  }}
                >
                  7 Days
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => {
                    const today = new Date();
                    setDateFrom(startOfWeek(today, { weekStartsOn: 1 }));
                    setDateTo(endOfWeek(today, { weekStartsOn: 1 }));
                  }}
                >
                  Week
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => {
                    const today = new Date();
                    setDateFrom(startOfMonth(today));
                    setDateTo(endOfMonth(today));
                  }}
                >
                  Month
                </Button>
              </div>
              
              {/* Single Calendar for Custom Range */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                  >
                    <CalendarIcon className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(date) => {
                      if (!dateFrom || dateTo) {
                        setDateFrom(date);
                        setDateTo(undefined);
                      } else {
                        if (date && date < dateFrom) {
                          setDateTo(dateFrom);
                          setDateFrom(date);
                        } else {
                          setDateTo(date);
                        }
                      }
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                  <div className="p-3 pt-0 border-t">
                    <p className="text-xs text-muted-foreground mb-2">
                      {!dateFrom ? "Select start date" : !dateTo ? "Select end date" : `${format(dateFrom, "MMM d")} - ${format(dateTo, "MMM d")}`}
                    </p>
                    {(dateFrom || dateTo) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={() => {
                          setDateFrom(undefined);
                          setDateTo(undefined);
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              
              {(dateFrom || dateTo) && (
                <span className="text-xs text-muted-foreground">
                  {dateFrom && dateTo 
                    ? `${format(dateFrom, "M/d")} - ${format(dateTo, "M/d")}`
                    : dateFrom ? `From ${format(dateFrom, "M/d")}` : ""
                  }
                </span>
              )}
              
              <div className="hidden sm:block h-6 w-px bg-border mx-1" />
              
              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                    <SelectItem value="Shipped">Shipped</SelectItem>
                    <SelectItem value="Delivered">Delivered</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
                  
                  {filteredActiveOrders.map((order) => {
                    const isCustomerApp = !order.created_by;
                    return (
                    <Card 
                      key={order.id} 
                      className={`shadow-sm cursor-pointer transition-colors ${
                        selectedOrders.has(order.id) ? 'ring-2 ring-primary' : ''
                      } ${
                        isCustomerApp
                          ? 'border-l-4 border-l-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15'
                          : 'hover:bg-muted/50'
                      }`}
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
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className="font-medium text-base truncate">{order.salons?.name || order.customer_name || "—"}</span>
                                  {isCustomerApp && (
                                    <Badge className="text-[10px] h-5 px-1.5 bg-emerald-500 text-white hover:bg-emerald-600 border-transparent">
                                      Customer App
                                    </Badge>
                                  )}
                                  {editedOrderIds.has(order.id) && (
                                    <Badge
                                      className="text-[10px] h-5 px-1.5 cursor-pointer bg-warning text-warning-foreground hover:bg-warning/90 border-transparent"
                                      onClick={(e) => { e.stopPropagation(); setHistoryOrderId(order.id); }}
                                    >
                                      Edited
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-sm text-muted-foreground flex-shrink-0">
                                  {new Date(order.order_date).toLocaleDateString()}
                                </span>
                              </div>
                              {order.technician_name && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  Tech: <span className="font-medium text-foreground">{order.technician_name}</span>
                                </div>
                              )}
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
                          <div className="flex items-center justify-between gap-2 pt-2 border-t">
                             <div className="text-lg font-semibold text-primary">
                               ${order.total.toFixed(2)}
                             </div>
                             <div className="flex gap-2 justify-end">
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
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-9"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Share2 className="h-4 w-4 mr-1" />
                                    Share
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 bg-popover z-50" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuLabel>Send receipt via</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {typeof (navigator as any).share === 'function' && (
                                    <DropdownMenuItem onClick={() => shareOrder(order, 'native')}>
                                      <Share2 className="h-4 w-4 mr-2" />
                                      Device share…
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => shareOrder(order, 'email')}>
                                    <Mail className="h-4 w-4 mr-2" />
                                    Email
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => shareOrder(order, 'sms')}>
                                    <Phone className="h-4 w-4 mr-2" />
                                    SMS
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => shareOrder(order, 'whatsapp')}>
                                    <MessageCircle className="h-4 w-4 mr-2" />
                                    WhatsApp
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => shareOrder(order, 'copy')}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy to clipboard
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                    );
                  })}
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
                  {filteredCompletedOrders.map((order) => {
                    const isCustomerApp = !order.created_by;
                    return (
                    <Card 
                      key={order.id} 
                      className={`shadow-sm cursor-pointer transition-colors ${
                        isCustomerApp
                          ? 'border-l-4 border-l-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setViewOrder(order)}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className="font-medium text-base truncate">{order.salons?.name || order.customer_name || "—"}</span>
                              {isCustomerApp && (
                                <Badge className="text-[10px] h-5 px-1.5 bg-emerald-500 text-white hover:bg-emerald-600 border-transparent">
                                  Customer App
                                </Badge>
                              )}
                              {editedOrderIds.has(order.id) && (
                                <Badge
                                  className="text-[10px] h-5 px-1.5 cursor-pointer bg-warning text-warning-foreground hover:bg-warning/90 border-transparent"
                                  onClick={(e) => { e.stopPropagation(); setHistoryOrderId(order.id); }}
                                >
                                  Edited
                                </Badge>
                              )}
                            </div>
                            {getStatusBadge(order.status)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(order.order_date).toLocaleDateString()}
                          </div>
                          {order.technician_name && (
                            <div className="text-xs text-muted-foreground -mt-1">
                              Tech: <span className="font-medium text-foreground">{order.technician_name}</span>
                            </div>
                          )}
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
                          <div className="flex items-center justify-between gap-2 pt-2">
                             <div className="text-lg font-semibold text-primary">
                               ${order.total.toFixed(2)}
                             </div>
                             <div className="flex gap-2 justify-end">
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
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-9"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Share2 className="h-4 w-4 mr-1" />
                                    Share
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 bg-popover z-50" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuLabel>Send receipt via</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {typeof (navigator as any).share === 'function' && (
                                    <DropdownMenuItem onClick={() => shareOrder(order, 'native')}>
                                      <Share2 className="h-4 w-4 mr-2" />
                                      Device share…
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => shareOrder(order, 'email')}>
                                    <Mail className="h-4 w-4 mr-2" />
                                    Email
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => shareOrder(order, 'sms')}>
                                    <Phone className="h-4 w-4 mr-2" />
                                    SMS
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => shareOrder(order, 'whatsapp')}>
                                    <MessageCircle className="h-4 w-4 mr-2" />
                                    WhatsApp
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => shareOrder(order, 'copy')}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy to clipboard
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                    );
                  })}
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

      {/* Orders Map - Lazy loaded */}
      <LazyOrdersMap 
        orders={orders.map(o => ({
          id: o.id,
          customer_name: o.customer_name || null,
          customer_address: o.customer_address || null,
          customer_email: o.customer_email || null,
          customer_phone: o.customer_phone || null,
          total: o.total,
          subtotal: o.subtotal,
          tax: o.tax,
          status: o.status,
          order_date: o.order_date,
          notes: o.notes || null,
          order_items: o.order_items?.map(item => ({
            id: item.id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            products: item.products ? {
              name: item.products.name,
              image_url: item.products.image_url || 
                (item.products.product_images && item.products.product_images[0]?.image_url) || 
                null,
            } : null,
          })),
        }))}
        open={isMapOpen}
        onOpenChange={setIsMapOpen}
        onStatusChange={() => fetchData()}
      />
    </div>
  );
};

export default Orders;
