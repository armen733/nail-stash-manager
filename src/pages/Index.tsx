import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Package, DollarSign, AlertTriangle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { downloadCSV } from "@/lib/csv-export";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

interface LowStockProduct {
  id: string;
  name: string;
  stock_on_hand: number;
  reorder_level: number;
}

interface RevenueData {
  date: string;
  revenue: number;
}

interface OrderStatusData {
  status: string;
  count: number;
  color: string;
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
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [orderStatusData, setOrderStatusData] = useState<OrderStatusData[]>([]);
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
        supabase.from("orders").select("id, total, created_at, salon_id, status, salons(name)"),
        supabase.from("salons").select("id"),
        supabase.from("products").select("id"),
        supabase.from("order_items").select("product_id, quantity, line_total, products(name)"),
        supabase.from("products").select("id, name, stock_on_hand, price_usd, reorder_level"),
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

      // Calculate low stock products
      const lowStock = (stockRes.data || [])
        .filter(p => p.stock_on_hand <= p.reorder_level && p.reorder_level > 0)
        .map(p => ({
          id: p.id,
          name: p.name,
          stock_on_hand: p.stock_on_hand,
          reorder_level: p.reorder_level,
        }))
        .sort((a, b) => a.stock_on_hand - b.stock_on_hand);
      
      setLowStockProducts(lowStock);

      // Calculate revenue trend data (last 7 days for day/week, last 30 for month)
      const days = timePeriod === "month" ? 30 : 7;
      const trendData: RevenueData[] = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayOrders = orders.filter(o => {
          const orderDate = new Date(o.created_at).toISOString().split('T')[0];
          return orderDate === dateStr;
        });
        
        const dayRevenue = dayOrders.reduce((sum, order) => sum + (order.total || 0), 0);
        
        trendData.push({
          date: timePeriod === "month" ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : date.toLocaleDateString('en-US', { weekday: 'short' }),
          revenue: dayRevenue,
        });
      }
      
      setRevenueData(trendData);

      // Calculate order status breakdown
      const statusCounts = orders.reduce((acc: Record<string, number>, order) => {
        const status = order.status || 'Draft';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      const statusColors: Record<string, string> = {
        'Draft': 'hsl(var(--muted))',
        'Sent': 'hsl(var(--primary))',
        'Delivered': 'hsl(var(--chart-2))',
      };

      const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        color: statusColors[status] || 'hsl(var(--muted))',
      }));

      setOrderStatusData(statusBreakdown);

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

  const exportDashboardData = () => {
    const exportData = [
      { metric: 'Total Orders', value: stats.totalOrders },
      { metric: 'Period Orders', value: stats.monthlyOrders },
      { metric: 'Active Salons', value: stats.totalSalons },
      { metric: 'Products', value: stats.totalProducts },
      { metric: 'Period Revenue', value: `$${stats.monthlyRevenue.toFixed(2)}` },
      { metric: 'Total Revenue', value: `$${stats.totalRevenue.toFixed(2)}` },
      { metric: 'Total Stock Value', value: `$${totalStockValue.toFixed(2)}` },
    ];
    downloadCSV(exportData, 'dashboard-overview');
    toast({ title: "Success", description: "Dashboard data exported successfully" });
  };
  
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
        <div className="flex flex-wrap gap-2">
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
          <Button onClick={exportDashboardData} variant="outline" size="default">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <Alert variant="destructive" className="animate-fade-in">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{lowStockProducts.length} product{lowStockProducts.length > 1 ? 's' : ''}</strong> running low on stock!
          </AlertDescription>
        </Alert>
      )}

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
            <CardTitle className="text-base sm:text-lg">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              <ChartContainer
                config={{
                  revenue: {
                    label: "Revenue",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="h-[300px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Order Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : orderStatusData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No orders yet. Create your first order to see analytics.
                </p>
              </div>
            ) : (
              <ChartContainer
                config={{
                  count: {
                    label: "Orders",
                  },
                }}
                className="h-[300px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={orderStatusData}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => `${entry.status}: ${entry.count}`}
                    >
                      {orderStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {lowStockProducts.length > 0 && (
        <Card className="shadow-[var(--shadow-card)] border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alert ({lowStockProducts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="space-y-3">
              {lowStockProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div className="flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Current: {product.stock_on_hand} • Reorder at: {product.reorder_level}
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-destructive/10 text-destructive rounded-full text-sm font-semibold">
                    {product.stock_on_hand === 0 ? 'Out of Stock' : 'Low Stock'}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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