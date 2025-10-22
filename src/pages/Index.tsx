import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Package, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Stats {
  totalOrders: number;
  monthlyOrders: number;
  totalSalons: number;
  totalProducts: number;
  monthlyRevenue: number;
  totalRevenue: number;
}

interface TopSalon {
  salon_name: string;
  order_count: number;
  total_revenue: number;
}

interface TopProduct {
  product_name: string;
  quantity_sold: number;
  revenue: number;
}

interface StockValue {
  product_name: string;
  stock: number;
  price: number;
  value: number;
}

const Index = () => {
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    monthlyOrders: 0,
    totalSalons: 0,
    totalProducts: 0,
    monthlyRevenue: 0,
    totalRevenue: 0,
  });
  const [topSalons, setTopSalons] = useState<TopSalon[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [stockValues, setStockValues] = useState<StockValue[]>([]);
  const [totalStockValue, setTotalStockValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<"day" | "week" | "month">("month");
  const { toast } = useToast();

  useEffect(() => {
    fetchDashboardData();
  }, [timePeriod]);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      const periodStart = timePeriod === "day"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
        : timePeriod === "week" 
        ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Fetch all stats in parallel
      const [ordersRes, salonsRes, productsRes, orderItemsRes, stockRes] = await Promise.all([
        supabase.from("orders").select("id, total, created_at, salon_id, salons(name)"),
        supabase.from("salons").select("id"),
        supabase.from("products").select("id"),
        supabase.from("order_items").select("product_id, quantity, line_total, products(name)"),
        supabase.from("products").select("name, stock_on_hand, price_usd"),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (salonsRes.error) throw salonsRes.error;
      if (productsRes.error) throw productsRes.error;
      if (orderItemsRes.error) throw orderItemsRes.error;
      if (stockRes.error) throw stockRes.error;

      const orders = ordersRes.data || [];
      const periodOrders = orders.filter(o => new Date(o.created_at) >= new Date(periodStart));

      // Calculate stats
      const newStats: Stats = {
        totalOrders: orders.length,
        monthlyOrders: periodOrders.length,
        totalSalons: salonsRes.data?.length || 0,
        totalProducts: productsRes.data?.length || 0,
        monthlyRevenue: periodOrders.reduce((sum, order) => sum + (order.total || 0), 0),
        totalRevenue: orders.reduce((sum, order) => sum + (order.total || 0), 0),
      };
      setStats(newStats);

      // Calculate top salons
      const salonStats = orders.reduce((acc: Record<string, { count: number; revenue: number; name: string }>, order) => {
        const salonId = order.salon_id;
        const salonName = order.salons?.name || "Unknown";
        if (!acc[salonId]) {
          acc[salonId] = { count: 0, revenue: 0, name: salonName };
        }
        acc[salonId].count += 1;
        acc[salonId].revenue += order.total || 0;
        return acc;
      }, {});

      const topSalonsData = Object.values(salonStats)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map(s => ({
          salon_name: s.name,
          order_count: s.count,
          total_revenue: s.revenue,
        }));
      setTopSalons(topSalonsData);

      // Calculate top products
      const productStats = (orderItemsRes.data || []).reduce((acc: Record<string, { quantity: number; revenue: number; name: string }>, item) => {
        const productId = item.product_id;
        const productName = item.products?.name || "Unknown";
        if (!acc[productId]) {
          acc[productId] = { quantity: 0, revenue: 0, name: productName };
        }
        acc[productId].quantity += item.quantity || 0;
        acc[productId].revenue += item.line_total || 0;
        return acc;
      }, {});

      const topProductsData = Object.values(productStats)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5)
        .map(p => ({
          product_name: p.name,
          quantity_sold: p.quantity,
          revenue: p.revenue,
        }));
      setTopProducts(topProductsData);

      // Calculate stock values
      const stockData = (stockRes.data || [])
        .filter(p => p.stock_on_hand > 0)
        .map(p => ({
          product_name: p.name,
          stock: p.stock_on_hand,
          price: p.price_usd,
          value: p.stock_on_hand * p.price_usd,
        }))
        .sort((a, b) => b.value - a.value);
      
      setStockValues(stockData);
      setTotalStockValue(stockData.reduce((sum, item) => sum + item.value, 0));

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

  const periodLabel = timePeriod === "day" ? "Today's" : timePeriod === "week" ? "Weekly" : "Monthly";
  
  const statsCards = [
    {
      title: `${periodLabel} Orders`,
      value: loading ? "..." : stats.monthlyOrders.toString(),
      icon: TrendingUp,
      description: `${stats.totalOrders} total orders`,
    },
    {
      title: "Active Salons",
      value: loading ? "..." : stats.totalSalons.toString(),
      icon: Users,
      description: "Total clients",
    },
    {
      title: "Products",
      value: loading ? "..." : stats.totalProducts.toString(),
      icon: Package,
      description: "In catalog",
    },
    {
      title: `${periodLabel} Revenue`,
      value: loading ? "..." : `$${stats.monthlyRevenue.toFixed(2)}`,
      icon: DollarSign,
      description: `$${stats.totalRevenue.toFixed(2)} total`,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome to Salon Supply Manager</p>
        </div>
        <Select value={timePeriod} onValueChange={(value: "day" | "week" | "month") => setTimePeriod(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => (
          <Card key={index} className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Top Salons</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : topSalons.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No data yet. Start adding salons and orders to see insights.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {topSalons.map((salon, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">{salon.salon_name}</p>
                      <p className="text-sm text-muted-foreground">{salon.order_count} orders</p>
                    </div>
                    <p className="font-semibold text-primary">${salon.total_revenue.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Top Products</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : topProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No data yet. Start adding products and orders to see insights.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">{product.product_name}</p>
                      <p className="text-sm text-muted-foreground">{product.quantity_sold} sold</p>
                    </div>
                    <p className="font-semibold text-primary">${product.revenue.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-base sm:text-lg">Stock Inventory Value</CardTitle>
          <div className="text-left sm:text-right">
            <p className="text-sm text-muted-foreground">Total Expected Profit</p>
            <p className="text-2xl font-bold text-primary">
              ${loading ? "..." : totalStockValue.toFixed(2)}
            </p>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : stockValues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No stock available. Add products to see inventory value.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {stockValues.map((item, index) => (
                <div key={index} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div className="flex-1">
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.stock} pieces × ${item.price.toFixed(2)}
                    </p>
                  </div>
                  <p className="font-semibold text-primary">${item.value.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;