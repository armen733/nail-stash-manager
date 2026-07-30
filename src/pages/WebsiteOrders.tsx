import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, ArrowLeft, Search, User, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toLocalDateStr } from "@/lib/timezone";

interface WebOrder {
  id: string;
  order_date: string;
  status: string;
  total: number;
  invoice_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  profile_id: string | null;
}

const WebsiteOrders = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["website-orders-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_date, status, total, invoice_number, customer_name, customer_email, profile_id")
        .is("salon_id", null)
        .is("created_by", null)
        .order("order_date", { ascending: false });
      if (error) throw error;
      return (data || []) as WebOrder[];
    },
  });

  const q = search.toLowerCase();
  const filtered = orders.filter(
    (o) =>
      !q ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.customer_email?.toLowerCase().includes(q) ||
      o.invoice_number?.toLowerCase().includes(q)
  );

  const totalRevenue = filtered.reduce((s, o) => s + Number(o.total || 0), 0);
  const customers = new Set(
    filtered.map((o) => o.profile_id || o.customer_email || o.customer_name || o.id)
  ).size;

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

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Orders</p>
          <p className="text-lg sm:text-2xl font-bold">{filtered.length}</p>
        </Card>
        <Card className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Customers</p>
          <p className="text-lg sm:text-2xl font-bold">{customers}</p>
        </Card>
        <Card className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Revenue</p>
          <p className="text-lg sm:text-2xl font-bold">${totalRevenue.toFixed(2)}</p>
        </Card>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg mb-3">All website orders</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customer, email or invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 min-h-[44px]"
            />
          </div>
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
                className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
                  o.profile_id ? "cursor-pointer hover:border-primary/50 transition-colors" : ""
                }`}
                onClick={() => o.profile_id && navigate(`/users?userId=${o.profile_id}`)}
              >
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
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-sm">${Number(o.total).toFixed(2)}</span>
                  {o.profile_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/users?userId=${o.profile_id}`);
                      }}
                    >
                      <User className="h-3.5 w-3.5 sm:mr-1" />
                      <span className="hidden sm:inline">Profile</span>
                      <ExternalLink className="h-3 w-3 ml-1 hidden sm:inline" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WebsiteOrders;
