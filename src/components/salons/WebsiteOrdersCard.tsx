import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, ChevronDown, ChevronUp, User, ExternalLink } from "lucide-react";
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

export const WebsiteOrdersCard = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["salons-website-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_date, status, total, invoice_number, customer_name, customer_email, profile_id, salon_id, created_by")
        .is("salon_id", null)
        .is("created_by", null)
        .order("order_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as WebOrder[];
    },
  });

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const customers = new Set(
    orders.map((o) => o.profile_id || o.customer_email || o.customer_name || o.id)
  ).size;

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader
        className="p-3 sm:p-6 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">Website orders</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {orders.length} orders · {customers} customers · ${totalRevenue.toFixed(2)}
              </p>
            </div>
          </div>
          {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-2">
          {isLoading ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No website orders yet.
            </div>
          ) : (
            orders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-lg border p-3"
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
      )}
    </Card>
  );
};
