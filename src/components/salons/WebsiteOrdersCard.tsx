import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const WebsiteOrdersCard = () => {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["salons-website-orders-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total, profile_id, customer_email, customer_name")
        .is("salon_id", null)
        .is("created_by", null);
      if (error) throw error;
      const rows = data || [];
      return {
        count: rows.length,
        revenue: rows.reduce((s, o) => s + Number(o.total || 0), 0),
        customers: new Set(
          rows.map((o: any) => o.profile_id || o.customer_email || o.customer_name || o.id)
        ).size,
      };
    },
  });

  return (
    <Card
      className="shadow-[var(--shadow-card)] cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => navigate("/salons/website-orders")}
    >
      <CardHeader className="p-3 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">Website orders</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {stats
                  ? `${stats.count} orders · ${stats.customers} customers · $${stats.revenue.toFixed(2)}`
                  : "Orders from the customer app"}
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
      </CardHeader>
    </Card>
  );
};
