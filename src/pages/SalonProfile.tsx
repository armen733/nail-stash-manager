import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { toast } from "sonner";
import {
  ArrowLeft, Phone, Mail, MapPin, ShoppingCart,
  DollarSign, Package, CalendarDays, Clock, TrendingUp, Pencil, FileText,
} from "lucide-react";
import { format, differenceInDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { generateSalonStatementPDF } from "@/lib/statement-pdf";

interface SalonData {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
}

interface OrderWithItems {
  id: string;
  invoice_number: string | null;
  order_date: string;
  total: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  notes: string | null;
  order_items: { product_id: string; quantity: number; unit_price: number; line_total: number }[];
}

interface ProductInfo {
  id: string;
  name: string;
  sku: string;
  image_url: string | null;
  first_image: string | null;
}

interface VisitRecord {
  id: string;
  visited_at: string;
  visit_type: string;
  notes: string | null;
}

export default function SalonProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [salon, setSalon] = useState<SalonData | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [products, setProducts] = useState<Map<string, ProductInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", contact_name: "", phone: "", email: "", address: "", city: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);

  const refresh = async () => {
    if (!id) return;
    const ordersRes = await supabase.from("orders")
      .select("id, invoice_number, order_date, total, amount_paid, balance_due, status, notes, order_items(product_id, quantity, unit_price, line_total)")
      .eq("salon_id", id)
      .order("order_date", { ascending: false });
    setOrders((ordersRes.data || []) as OrderWithItems[]);
  };

  useEffect(() => {
    if (!id) return;
    const fetchAll = async () => {
      setLoading(true);
      const [salonRes, ordersRes, visitsRes] = await Promise.all([
        supabase.from("salons").select("*").eq("id", id).single(),
        supabase.from("orders").select("id, invoice_number, order_date, total, amount_paid, balance_due, status, notes, order_items(product_id, quantity, unit_price, line_total)").eq("salon_id", id).order("order_date", { ascending: false }),
        supabase.from("salon_visits").select("id, visited_at, visit_type, notes").eq("salon_id", id).order("visited_at", { ascending: false }),
      ]);

      if (salonRes.data) setSalon(salonRes.data);
      const ordersData = (ordersRes.data || []) as OrderWithItems[];
      setOrders(ordersData);
      setVisits((visitsRes.data || []) as VisitRecord[]);
      

      // Fetch product info + images for all ordered products
      const productIds = new Set<string>();
      ordersData.forEach(o => o.order_items?.forEach(i => productIds.add(i.product_id)));
      if (productIds.size > 0) {
        const idsArr = Array.from(productIds);
        const [{ data: prods }, { data: images }] = await Promise.all([
          supabase.from("products").select("id, name, sku, image_url").in("id", idsArr),
          supabase.from("product_images").select("product_id, image_url, display_order").in("product_id", idsArr).order("display_order", { ascending: true }),
        ]);
        // Build a map of first image per product
        const firstImageMap = new Map<string, string>();
        (images || []).forEach(img => {
          if (!firstImageMap.has(img.product_id)) {
            firstImageMap.set(img.product_id, img.image_url);
          }
        });
        const map = new Map<string, ProductInfo>();
        (prods || []).forEach(p => map.set(p.id, {
          ...p,
          first_image: firstImageMap.get(p.id) || p.image_url || null,
        }));
        setProducts(map);
      }
      setLoading(false);
    };
    fetchAll();
  }, [id]);

  // Edit handlers
  const openEdit = () => {
    if (!salon) return;
    setEditForm({
      name: salon.name,
      contact_name: salon.contact_name || "",
      phone: salon.phone || "",
      email: salon.email || "",
      address: salon.address || "",
      city: salon.city || "",
      notes: salon.notes || "",
    });
    setEditOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salon) return;
    setSaving(true);
    const { error } = await supabase.from("salons").update({
      name: editForm.name,
      contact_name: editForm.contact_name || null,
      phone: editForm.phone || null,
      email: editForm.email || null,
      address: editForm.address || null,
      city: editForm.city || null,
      notes: editForm.notes || null,
    }).eq("id", salon.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to update salon");
    } else {
      setSalon({ ...salon, ...editForm, contact_name: editForm.contact_name || null, phone: editForm.phone || null, email: editForm.email || null, address: editForm.address || null, city: editForm.city || null, notes: editForm.notes || null });
      setEditOpen(false);
      toast.success("Salon updated");
    }
  };

  // Computed stats
  const totalRevenue = useMemo(() => orders.reduce((s, o) => s + Number(o.total), 0), [orders]);
  const avgOrderValue = useMemo(() => orders.length ? totalRevenue / orders.length : 0, [orders, totalRevenue]);
  const lastVisit = visits[0]?.visited_at ? new Date(visits[0].visited_at) : null;
  const daysSinceVisit = lastVisit ? differenceInDays(new Date(), lastVisit) : null;

  const monthlyData = useMemo(() => {
    const months: { month: string; revenue: number; orders: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      const monthOrders = orders.filter(o => {
        const od = new Date(o.order_date);
        return od >= start && od <= end;
      });
      months.push({
        month: format(d, "MMM"),
        revenue: monthOrders.reduce((s, o) => s + Number(o.total), 0),
        orders: monthOrders.length,
      });
    }
    return months;
  }, [orders]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    orders.forEach(o => o.order_items?.forEach(i => {
      const prev = map.get(i.product_id) || { qty: 0, revenue: 0 };
      map.set(i.product_id, { qty: prev.qty + i.quantity, revenue: prev.revenue + Number(i.line_total) });
    }));
    return Array.from(map.entries())
      .map(([pid, stats]) => ({ product: products.get(pid), ...stats }))
      .filter(p => p.product)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);
  }, [orders, products]);

  const visitStatusColor = daysSinceVisit === null
    ? "text-destructive" : daysSinceVisit >= 15
    ? "text-destructive" : daysSinceVisit >= 10
    ? "text-orange-500" : "text-green-500";

  const visitStatusLabel = daysSinceVisit === null
    ? "Never visited" : `${daysSinceVisit}d ago`;

  const getProductImage = (p: ProductInfo) => p.first_image || p.image_url;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Salon not found.</p>
        <Button variant="ghost" onClick={() => navigate(-1)} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mt-0.5 flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{salon.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
            {salon.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{salon.city}</span>}
            {salon.contact_name && <span>· {salon.contact_name}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!salon) return;
              generateSalonStatementPDF({
                salon,
                orders: orders.map((o) => ({
                  id: o.id,
                  invoice_number: o.invoice_number,
                  order_date: o.order_date,
                  total: Number(o.total),
                  amount_paid: Number(o.amount_paid),
                  balance_due: Number(o.balance_due),
                  status: o.status,
                })),
                payments: [],
              });
            }}
          >
            <FileText className="h-4 w-4 mr-1.5" /> Statement
          </Button>
          <Button variant="outline" size="icon" onClick={openEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Contact actions */}
      <div className="flex flex-wrap gap-2">
        {salon.phone && (
          <Button variant="outline" size="sm" asChild>
            <a href={`tel:${salon.phone}`}><Phone className="h-3.5 w-3.5 mr-1.5" />{salon.phone}</a>
          </Button>
        )}
        {salon.email && (
          <Button variant="outline" size="sm" asChild>
            <a href={`mailto:${salon.email}`}><Mail className="h-3.5 w-3.5 mr-1.5" />Email</a>
          </Button>
        )}
        {salon.address && (
          <Button variant="outline" size="sm" onClick={() => {
            const encoded = encodeURIComponent(salon.address!);
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            window.open(isIOS ? `maps://maps.apple.com/?q=${encoded}` : `https://maps.google.com/?q=${encoded}`, '_blank');
          }}>
            <MapPin className="h-3.5 w-3.5 mr-1.5" />Directions
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <ShoppingCart className="h-3.5 w-3.5" /> Orders
          </div>
          <p className="text-lg font-bold">{orders.length}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <DollarSign className="h-3.5 w-3.5" /> Revenue
          </div>
          <p className="text-lg font-bold">${totalRevenue.toFixed(2)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="h-3.5 w-3.5" /> Avg Order
          </div>
          <p className="text-lg font-bold">${avgOrderValue.toFixed(2)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Clock className="h-3.5 w-3.5" /> Last Visit
          </div>
          <p className={`text-lg font-bold ${visitStatusColor}`}>{visitStatusLabel}</p>
        </Card>
      </div>

      {/* Monthly Revenue Chart */}
      <Card>
        <CardHeader className="pb-2 px-3 pt-3 sm:px-6 sm:pt-6">
          <CardTitle className="text-sm font-semibold">Monthly Revenue</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" fontSize={12} className="fill-muted-foreground" />
                <YAxis fontSize={12} className="fill-muted-foreground" tickFormatter={v => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-3 pt-3 sm:px-6 sm:pt-6">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4" /> Top Products
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
            <div className="space-y-2">
              {topProducts.map((tp, i) => {
                const imgUrl = getProductImage(tp.product!);
                return (
                  <div key={tp.product!.id} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
                    {imgUrl ? (
                      <img src={imgUrl} alt="" className="w-9 h-9 rounded object-cover border border-border" />
                    ) : (
                      <div className="w-9 h-9 rounded bg-muted flex items-center justify-center border border-border">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{tp.product!.name}</p>
                      <p className="text-xs text-muted-foreground">{tp.product!.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{tp.qty} units</p>
                      <p className="text-xs text-muted-foreground">${tp.revenue.toFixed(2)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visit History */}
      <Card>
        <CardHeader className="pb-2 px-3 pt-3 sm:px-6 sm:pt-6">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Visit History
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
          {visits.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No visits recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {visits.slice(0, 20).map(v => (
                <div key={v.id} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${v.visit_type === "order" ? "bg-primary" : "bg-green-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{format(new Date(v.visited_at), "MMM d, yyyy")}</p>
                    {v.notes && <p className="text-xs text-muted-foreground truncate">{v.notes}</p>}
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{v.visit_type}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>



      {/* Order History */}
      <Card>
        <CardHeader className="pb-2 px-3 pt-3 sm:px-6 sm:pt-6">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> Order History
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No orders yet.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {orders.slice(0, 30).map(o => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded-md px-1 -mx-1 transition-colors cursor-pointer"
                  onClick={() => setSelectedOrder(o)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{format(new Date(o.order_date), "MMM d, yyyy")}</p>
                      {o.invoice_number && (
                        <span className="text-[10px] text-muted-foreground">{o.invoice_number}</span>
                      )}
                      <Badge variant="default" className="text-[10px]">{o.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {o.order_items?.length || 0} items
                      {o.notes ? ` · ${o.notes}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">${Number(o.total).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {salon.notes && (
        <Card className="p-3 sm:p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
          <p className="text-sm">{salon.notes}</p>
        </Card>
      )}

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={open => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Order — {selectedOrder && format(new Date(selectedOrder.order_date), "MMM d, yyyy")}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant={selectedOrder.status === "Paid" || selectedOrder.status === "Delivered" ? "default" : "secondary"}>
                  {selectedOrder.status}
                </Badge>
                <p className="text-lg font-bold">${Number(selectedOrder.total).toFixed(2)}</p>
              </div>
              {selectedOrder.notes && (
                <p className="text-sm text-muted-foreground italic">"{selectedOrder.notes}"</p>
              )}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Items</p>
                {(selectedOrder.order_items || []).map((item, idx) => {
                  const prod = products.get(item.product_id);
                  const imgUrl = prod ? getProductImage(prod) : null;
                  return (
                    <div key={idx} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                      {imgUrl ? (
                        <img src={imgUrl} alt="" className="w-10 h-10 rounded object-cover border border-border" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center border border-border">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{prod?.name || "Unknown product"}</p>
                        <p className="text-xs text-muted-foreground">{prod?.sku || "—"} · Qty: {item.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">${Number(item.line_total).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">${Number(item.unit_price).toFixed(2)} ea</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Salon</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Salon Name *</Label>
              <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required className="min-h-[44px]" />
            </div>
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input value={editForm.contact_name} onChange={e => setEditForm({ ...editForm, contact_name: e.target.value })} className="min-h-[44px]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="min-h-[44px]" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="min-h-[44px]" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <AddressAutocomplete
                value={editForm.address}
                onChange={(address, city) => setEditForm({ ...editForm, address, ...(city && { city }) })}
                placeholder="Start typing address..."
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} className="min-h-[44px]" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="min-h-[44px]" />
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="min-h-[44px]">Cancel</Button>
              <Button type="submit" disabled={saving} className="min-h-[44px]">{saving ? "Saving..." : "Save Changes"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>



    </div>
  );
}
