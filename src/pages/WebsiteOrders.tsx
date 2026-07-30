import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Globe,
  ArrowLeft,
  Search,
  User,
  ExternalLink,
  MapPin,
  Mail,
  Phone,
  Package,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toLocalDateStr } from "@/lib/timezone";

interface WebOrder {
  id: string;
  order_date: string;
  status: string;
  total: number;
  subtotal: number | null;
  invoice_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  profile_id: string | null;
  order_items?: {
    quantity: number;
    line_total: number;
    products: { name: string; sku: string; image_url: string | null } | null;
  }[];
}

const money = (n: number) => `$${n.toFixed(2)}`;

const WebsiteOrders = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["website-orders-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_date, status, total, subtotal, invoice_number, customer_name, customer_email, customer_phone, customer_address, profile_id, order_items(quantity, line_total, products(name, sku, image_url))"
        )
        .is("salon_id", null)
        .is("created_by", null)
        .order("order_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WebOrder[];
    },
  });

  const q = search.toLowerCase();
  const filtered = orders.filter(
    (o) =>
      !q ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.customer_email?.toLowerCase().includes(q) ||
      o.customer_address?.toLowerCase().includes(q) ||
      o.invoice_number?.toLowerCase().includes(q)
  );

  // ---- Aggregations ----
  const totalRevenue = filtered.reduce((s, o) => s + Number(o.total || 0), 0);
  const avgOrder = filtered.length ? totalRevenue / filtered.length : 0;
  const unitsSold = filtered.reduce(
    (s, o) => s + (o.order_items || []).reduce((a, i) => a + Number(i.quantity || 0), 0),
    0
  );

  type Cust = {
    key: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    profileId: string | null;
    orders: number;
    revenue: number;
    lastOrder: string;
  };

  const customerMap = new Map<string, Cust>();
  filtered.forEach((o) => {
    const key = o.profile_id || o.customer_email?.toLowerCase() || o.customer_name || o.id;
    const existing = customerMap.get(key);
    if (existing) {
      existing.orders += 1;
      existing.revenue += Number(o.total || 0);
      existing.address = existing.address || o.customer_address;
      existing.phone = existing.phone || o.customer_phone;
      existing.email = existing.email || o.customer_email;
      if (o.order_date > existing.lastOrder) existing.lastOrder = o.order_date;
    } else {
      customerMap.set(key, {
        key,
        name: o.customer_name || o.customer_email || "Guest",
        email: o.customer_email,
        phone: o.customer_phone,
        address: o.customer_address,
        profileId: o.profile_id,
        orders: 1,
        revenue: Number(o.total || 0),
        lastOrder: o.order_date,
      });
    }
  });
  const customers = Array.from(customerMap.values()).sort((a, b) => b.revenue - a.revenue);
  const repeatCustomers = customers.filter((c) => c.orders > 1).length;

  type Prod = { name: string; sku: string; image: string | null; qty: number; revenue: number };
  const productMap = new Map<string, Prod>();
  filtered.forEach((o) =>
    (o.order_items || []).forEach((i) => {
      if (!i.products) return;
      const key = i.products.sku || i.products.name;
      const p = productMap.get(key) || {
        name: i.products.name,
        sku: i.products.sku,
        image: i.products.image_url,
        qty: 0,
        revenue: 0,
      };
      p.qty += Number(i.quantity || 0);
      p.revenue += Number(i.line_total || 0);
      productMap.set(key, p);
    })
  );
  const topProducts = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty);

  const cityMap = new Map<string, { orders: number; revenue: number }>();
  filtered.forEach((o) => {
    if (!o.customer_address) return;
    const parts = o.customer_address.split(",").map((p) => p.trim());
    const city = parts.length >= 3 ? parts[parts.length - 3] : parts[0];
    if (!city) return;
    const c = cityMap.get(city) || { orders: 0, revenue: 0 };
    c.orders += 1;
    c.revenue += Number(o.total || 0);
    cityMap.set(city, c);
  });
  const topCities = Array.from(cityMap.entries())
    .map(([city, v]) => ({ city, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const goProfile = (id: string | null) => id && navigate(`/users?userId=${id}`);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/salons")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Website orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Orders placed through the customer app
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3">
        {[
          { label: "Orders", value: String(filtered.length) },
          { label: "Customers", value: String(customers.length) },
          { label: "Repeat buyers", value: String(repeatCustomers) },
          { label: "Units sold", value: String(unitsSold) },
          { label: "Revenue", value: money(totalRevenue) },
          { label: "Avg order", value: money(avgOrder) },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="text-base sm:text-xl font-bold">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customer, email, address or invoice..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 min-h-[44px]"
        />
      </div>

      <Tabs defaultValue="customers">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="customers" className="text-xs sm:text-sm">Customers</TabsTrigger>
          <TabsTrigger value="products" className="text-xs sm:text-sm">Products</TabsTrigger>
          <TabsTrigger value="locations" className="text-xs sm:text-sm">Locations</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs sm:text-sm">Orders</TabsTrigger>
        </TabsList>

        {/* CUSTOMER RANKING */}
        <TabsContent value="customers" className="mt-3">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" /> Customer ranking
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-2">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
              ) : customers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No customers yet.</div>
              ) : (
                customers.map((c, idx) => (
                  <div
                    key={c.key}
                    className={`rounded-lg border p-3 ${c.profileId ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}`}
                    onClick={() => goProfile(c.profileId)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <Badge variant={idx < 3 ? "default" : "outline"} className="shrink-0 mt-0.5">
                          #{idx + 1}
                        </Badge>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{c.name}</p>
                          {c.email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3 shrink-0" /> {c.email}
                            </p>
                          )}
                          {c.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              <Phone className="h-3 w-3 shrink-0" /> {c.phone}
                            </p>
                          )}
                          {c.address && (
                            <p className="text-xs text-muted-foreground flex items-start gap-1">
                              <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{c.address}</span>
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {c.orders} order{c.orders > 1 ? "s" : ""} · last {toLocalDateStr(c.lastOrder)}
                            {c.orders > 1 && ` · avg ${money(c.revenue / c.orders)}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-sm">{money(c.revenue)}</p>
                        {c.profileId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 mt-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              goProfile(c.profileId);
                            }}
                          >
                            <User className="h-3 w-3 sm:mr-1" />
                            <span className="hidden sm:inline">Profile</span>
                            <ExternalLink className="h-3 w-3 ml-1 hidden sm:inline" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BEST SELLERS */}
        <TabsContent value="products" className="mt-3">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> Best sellers online
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-2">
              {topProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No product data.</div>
              ) : (
                topProducts.map((p, idx) => (
                  <div key={p.sku + idx} className="flex items-center gap-3 rounded-lg border p-3">
                    <Badge variant={idx < 3 ? "default" : "outline"} className="shrink-0">#{idx + 1}</Badge>
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        loading="lazy"
                        className="h-10 w-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{p.qty} sold</p>
                      <p className="text-xs text-muted-foreground">{money(p.revenue)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOCATIONS */}
        <TabsContent value="locations" className="mt-3">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Top shipping locations
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-2">
              {topCities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No address data available.
                </div>
              ) : (
                topCities.map((c, idx) => (
                  <div key={c.city} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={idx < 3 ? "default" : "outline"} className="shrink-0">#{idx + 1}</Badge>
                      <span className="text-sm truncate">{c.city}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{money(c.revenue)}</p>
                      <p className="text-xs text-muted-foreground">{c.orders} orders</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ORDERS */}
        <TabsContent value="orders" className="mt-3">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">All website orders</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-2">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No website orders found.
                </div>
              ) : (
                filtered.map((o) => (
                  <div
                    key={o.id}
                    className={`rounded-lg border p-3 ${o.profile_id ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}`}
                    onClick={() => goProfile(o.profile_id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {o.customer_name || o.customer_email || "Guest"}
                          </span>
                          <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {o.invoice_number ? `${o.invoice_number} · ` : ""}
                          {toLocalDateStr(o.order_date)}
                          {o.customer_email ? ` · ${o.customer_email}` : ""}
                        </p>
                        {o.customer_address && (
                          <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                            <span className="line-clamp-1">{o.customer_address}</span>
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {(o.order_items || []).reduce((a, i) => a + Number(i.quantity || 0), 0)} items
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold text-sm">{money(Number(o.total))}</span>
                        {o.profile_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              goProfile(o.profile_id);
                            }}
                          >
                            <User className="h-3.5 w-3.5 sm:mr-1" />
                            <span className="hidden sm:inline">Profile</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WebsiteOrders;
