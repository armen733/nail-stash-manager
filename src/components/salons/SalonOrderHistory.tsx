import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Package, Calendar, DollarSign, ShoppingBag } from "lucide-react";
import { format } from "date-fns";

interface SalonOrderHistoryProps {
  salonId: string | null;
  salonName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OrderWithItems {
  id: string;
  order_date: string;
  status: string;
  total: number;
  subtotal: number;
  customer_name: string | null;
  notes: string | null;
  order_items: {
    id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    products: {
      name: string;
      sku: string;
      image_url: string | null;
    } | null;
  }[];
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Draft: "secondary",
  Confirmed: "default",
  Shipped: "default",
  Delivered: "default",
  Paid: "default",
};

const statusColor: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Confirmed: "bg-blue-500/15 text-blue-500 border-blue-500/20",
  Shipped: "bg-purple-500/15 text-purple-500 border-purple-500/20",
  Delivered: "bg-green-500/15 text-green-500 border-green-500/20",
  Paid: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
};

export const SalonOrderHistory = ({ salonId, salonName, open, onOpenChange }: SalonOrderHistoryProps) => {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !salonId) return;

    const fetchOrders = async () => {
      setLoading(true);
      try {
        // Paginate to get ALL orders (bypass 1000 row limit)
        const PAGE_SIZE = 1000;
        let allOrders: any[] = [];
        let page = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from("orders")
            .select(`
              id, order_date, status, total, subtotal, customer_name, notes,
              order_items (
                id, quantity, unit_price, line_total,
                products ( name, sku, image_url )
              )
            `)
            .eq("salon_id", salonId)
            .order("order_date", { ascending: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allOrders = [...allOrders, ...data];
            hasMore = data.length === PAGE_SIZE;
            page++;
          } else {
            hasMore = false;
          }
        }

        setOrders((allOrders as unknown as OrderWithItems[]) || []);
      } catch (err) {
        console.error("Failed to fetch salon orders:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [open, salonId]);

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const totalOrders = orders.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            {salonName} — Order History
          </DialogTitle>
        </DialogHeader>

        {/* Summary stats */}
        {!loading && orders.length > 0 && (
          <div className="flex gap-4 text-sm border-b pb-3">
            <div className="flex items-center gap-1.5">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Orders:</span>
              <span className="font-semibold">{totalOrders}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Total Revenue:</span>
              <span className="font-semibold text-primary">${totalRevenue.toFixed(2)}</span>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No orders found for this salon</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="border rounded-lg p-3 sm:p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium">
                        {format(new Date(order.order_date), "MMM d, yyyy")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        #{order.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs ${statusColor[order.status] || ""}`} variant="outline">
                        {order.status}
                      </Badge>
                      <span className="font-semibold text-sm">${Number(order.total).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Order items */}
                  {order.order_items && order.order_items.length > 0 && (
                    <div className="space-y-1 pl-6">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="truncate flex-1">
                            {item.products?.name || "Unknown"} × {item.quantity}
                            {item.products?.sku && (
                              <span className="ml-1.5 text-[10px] opacity-60">({item.products.sku})</span>
                            )}
                          </span>
                          <span className="ml-2">${Number(item.line_total).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {order.notes && (
                    <p className="text-xs text-muted-foreground pl-6 italic">
                      {order.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
