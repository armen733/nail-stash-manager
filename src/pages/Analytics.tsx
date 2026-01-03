import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  ResponsiveContainer, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line 
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, TrendingDown, DollarSign, Package, ShoppingCart, Users, 
  BarChart3, ArrowUpRight, ArrowDownRight, Boxes
} from "lucide-react";
import { format, subDays, startOfMonth, startOfWeek, eachDayOfInterval, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
}

interface CategorySales {
  category: string;
  revenue: number;
  quantity: number;
}

interface CustomerInsight {
  id: string;
  name: string;
  email: string;
  totalSpent: number;
  orderCount: number;
}

interface ProductPerformance {
  name: string;
  revenue: number;
  quantity: number;
  profit: number;
  stock: number;
}

const Analytics = () => {
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [topProducts, setTopProducts] = useState<ProductPerformance[]>([]);
  const [topCustomers, setTopCustomers] = useState<CustomerInsight[]>([]);
  const [slowMoving, setSlowMoving] = useState<ProductPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month");
  const [previousPeriodStats, setPreviousPeriodStats] = useState({ revenue: 0, orders: 0, customers: 0 });
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const getPeriodDates = () => {
    const now = new Date();
    let periodStart: Date;
    let previousStart: Date;
    let previousEnd: Date;

    if (period === "week") {
      periodStart = subDays(now, 7);
      previousEnd = subDays(periodStart, 1);
      previousStart = subDays(previousEnd, 7);
    } else if (period === "month") {
      periodStart = startOfMonth(now);
      previousEnd = subDays(periodStart, 1);
      previousStart = startOfMonth(previousEnd);
    } else {
      periodStart = subDays(now, 90);
      previousEnd = subDays(periodStart, 1);
      previousStart = subDays(previousEnd, 90);
    }

    return { periodStart, previousStart, previousEnd, now };
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const { periodStart, previousStart, previousEnd, now } = getPeriodDates();

      // Fetch current period orders
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(`
          id, created_at, total, profile_id, customer_email, customer_name, status,
          order_items (
            quantity, unit_price, line_total,
            products (name, category, price_usd, wholesale_price_usd, stock_on_hand)
          )
        `)
        .gte("created_at", periodStart.toISOString())
        .in("status", ["Confirmed", "Shipped", "Delivered", "Paid"]);

      if (ordersError) throw ordersError;

      // Fetch previous period for comparison
      const { data: previousOrders } = await supabase
        .from("orders")
        .select("id, total, profile_id, customer_email")
        .gte("created_at", previousStart.toISOString())
        .lte("created_at", previousEnd.toISOString())
        .in("status", ["Confirmed", "Shipped", "Delivered", "Paid"]);

      // Calculate previous period stats
      const prevRevenue = previousOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
      const prevOrderCount = previousOrders?.length || 0;
      const prevCustomers = new Set(previousOrders?.map(o => o.profile_id || o.customer_email)).size;
      setPreviousPeriodStats({ revenue: prevRevenue, orders: prevOrderCount, customers: prevCustomers });

      // Calculate daily revenue
      const days = eachDayOfInterval({ start: periodStart, end: now });
      const dailyMap: Record<string, DailyRevenue> = {};
      days.forEach(day => {
        const dateStr = format(day, "MMM dd");
        dailyMap[dateStr] = { date: dateStr, revenue: 0, orders: 0 };
      });

      orders?.forEach(order => {
        const dateStr = format(parseISO(order.created_at), "MMM dd");
        if (dailyMap[dateStr]) {
          dailyMap[dateStr].revenue += order.total || 0;
          dailyMap[dateStr].orders += 1;
        }
      });
      setDailyRevenue(Object.values(dailyMap));

      // Calculate category sales & product performance
      const categoryMap: Record<string, CategorySales> = {};
      const productMap: Record<string, ProductPerformance> = {};
      const customerMap: Record<string, CustomerInsight> = {};

      orders?.forEach((order) => {
        // Customer insights
        const customerId = order.profile_id || order.customer_email || "unknown";
        if (!customerMap[customerId]) {
          customerMap[customerId] = {
            id: customerId,
            name: order.customer_name || "Unknown",
            email: order.customer_email || "",
            totalSpent: 0,
            orderCount: 0
          };
        }
        customerMap[customerId].totalSpent += order.total || 0;
        customerMap[customerId].orderCount += 1;

        order.order_items?.forEach((item: any) => {
          const product = item.products;
          if (!product) return;

          const category = product.category;
          const productName = product.name;

          // Category sales
          if (!categoryMap[category]) {
            categoryMap[category] = { category, revenue: 0, quantity: 0 };
          }
          categoryMap[category].revenue += item.line_total;
          categoryMap[category].quantity += item.quantity;

          // Product performance
          if (!productMap[productName]) {
            productMap[productName] = {
              name: productName,
              revenue: 0,
              quantity: 0,
              profit: 0,
              stock: product.stock_on_hand || 0
            };
          }
          productMap[productName].revenue += item.line_total;
          productMap[productName].quantity += item.quantity;
          
          const cost = product.wholesale_price_usd || 0;
          const profit = (item.unit_price - cost) * item.quantity;
          productMap[productName].profit += profit;
        });
      });

      setCategorySales(Object.values(categoryMap).sort((a, b) => b.revenue - a.revenue));
      setTopProducts(Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
      setTopCustomers(Object.values(customerMap).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5));

      // Fetch slow-moving products (low sales, high stock)
      const { data: allProducts } = await supabase
        .from("products")
        .select("name, stock_on_hand, price_usd")
        .gt("stock_on_hand", 10)
        .order("stock_on_hand", { ascending: false })
        .limit(10);

      const slowMovingProducts = (allProducts || [])
        .filter(p => !productMap[p.name] || productMap[p.name].quantity < 3)
        .map(p => ({
          name: p.name,
          revenue: productMap[p.name]?.revenue || 0,
          quantity: productMap[p.name]?.quantity || 0,
          profit: 0,
          stock: p.stock_on_hand || 0
        }))
        .slice(0, 5);
      setSlowMoving(slowMovingProducts);

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

  const COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "#8884d8",
    "#82ca9d",
    "#ffc658"
  ];

  const totalRevenue = dailyRevenue.reduce((sum, d) => sum + d.revenue, 0);
  const totalOrders = dailyRevenue.reduce((sum, d) => sum + d.orders, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalProfit = topProducts.reduce((sum, prod) => sum + prod.profit, 0);
  const uniqueCustomers = topCustomers.length;

  // Calculate percentage changes
  const revenueChange = previousPeriodStats.revenue > 0 
    ? ((totalRevenue - previousPeriodStats.revenue) / previousPeriodStats.revenue) * 100 
    : 0;
  const ordersChange = previousPeriodStats.orders > 0 
    ? ((totalOrders - previousPeriodStats.orders) / previousPeriodStats.orders) * 100 
    : 0;

  const StatCard = ({ title, value, icon: Icon, change, prefix = "" }: { 
    title: string; 
    value: string | number; 
    icon: any; 
    change?: number;
    prefix?: string;
  }) => (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">{title}</p>
            <p className="text-xl sm:text-2xl font-bold mt-1">{prefix}{value}</p>
            {change !== undefined && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                <span>{Math.abs(change).toFixed(1)}% vs last period</span>
              </div>
            )}
          </div>
          <div className="p-3 rounded-full bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Analytics Dashboard</h1>
            <p className="text-sm text-muted-foreground">Comprehensive business insights</p>
          </div>
        </div>
        <Select value={period} onValueChange={(value: "week" | "month" | "quarter") => setPeriod(value)}>
          <SelectTrigger className="w-full sm:w-[180px] h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="quarter">Last Quarter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Revenue" 
          value={totalRevenue.toFixed(2)} 
          icon={DollarSign} 
          change={revenueChange}
          prefix="$"
        />
        <StatCard 
          title="Total Orders" 
          value={totalOrders} 
          icon={ShoppingCart} 
          change={ordersChange}
        />
        <StatCard 
          title="Avg Order Value" 
          value={avgOrderValue.toFixed(2)} 
          icon={TrendingUp}
          prefix="$"
        />
        <StatCard 
          title="Total Profit" 
          value={totalProfit.toFixed(2)} 
          icon={TrendingUp}
          prefix="$"
        />
      </div>

      {/* Revenue Trend Chart */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Revenue & Orders Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading...</div>
          ) : (
            <ChartContainer config={{}} className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyRevenue}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1} 
                    fill="url(#colorRevenue)" 
                    name="Revenue ($)"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="orders" 
                    stroke="hsl(var(--chart-2))" 
                    strokeWidth={2}
                    dot={false}
                    name="Orders"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabs for different analytics sections */}
      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="sales" className="text-xs sm:text-sm py-2">Sales</TabsTrigger>
          <TabsTrigger value="customers" className="text-xs sm:text-sm py-2">Customers</TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs sm:text-sm py-2">Inventory</TabsTrigger>
        </TabsList>

        {/* Sales Tab */}
        <TabsContent value="sales" className="mt-4 space-y-4">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {/* Category Sales Pie */}
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Sales by Category</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {loading || categorySales.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                    {loading ? "Loading..." : "No data available"}
                  </div>
                ) : (
                  <ChartContainer config={{}} className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categorySales}
                          dataKey="revenue"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          label={({ category, percent }) => `${category}: ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {categorySales.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Top Products Bar Chart */}
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Top Products by Revenue</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {loading || topProducts.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                    {loading ? "Loading..." : "No data available"}
                  </div>
                ) : (
                  <ChartContainer config={{}} className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topProducts.slice(0, 5)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={10}
                          width={100}
                          tickFormatter={(value) => value.length > 15 ? value.slice(0, 15) + '...' : value}
                        />
                        <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Product Performance Table */}
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Product Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {loading || topProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {loading ? "Loading..." : "No data available"}
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground">Product</th>
                        <th className="text-right py-3 px-3 text-xs font-medium text-muted-foreground">Units Sold</th>
                        <th className="text-right py-3 px-3 text-xs font-medium text-muted-foreground">Revenue</th>
                        <th className="text-right py-3 px-3 text-xs font-medium text-muted-foreground">Profit</th>
                        <th className="text-right py-3 px-3 text-xs font-medium text-muted-foreground">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((product, index) => {
                        const margin = product.revenue > 0 ? (product.profit / product.revenue) * 100 : 0;
                        return (
                          <tr key={index} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-3 text-sm font-medium max-w-[150px] truncate">{product.name}</td>
                            <td className="text-right py-3 px-3 text-sm">{product.quantity}</td>
                            <td className="text-right py-3 px-3 text-sm font-medium">${product.revenue.toFixed(2)}</td>
                            <td className="text-right py-3 px-3 text-sm text-green-500">${product.profit.toFixed(2)}</td>
                            <td className="text-right py-3 px-3">
                              <Badge variant={margin > 30 ? "default" : margin > 15 ? "secondary" : "outline"}>
                                {margin.toFixed(1)}%
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers" className="mt-4 space-y-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-blue-500/10">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Customers</p>
                    <p className="text-2xl font-bold">{uniqueCustomers}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-green-500/10">
                    <DollarSign className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Customer Value</p>
                    <p className="text-2xl font-bold">
                      ${uniqueCustomers > 0 ? (totalRevenue / uniqueCustomers).toFixed(2) : "0.00"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-purple-500/10">
                    <ShoppingCart className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Orders/Customer</p>
                    <p className="text-2xl font-bold">
                      {uniqueCustomers > 0 ? (totalOrders / uniqueCustomers).toFixed(1) : "0"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Customers */}
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Top Customers
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {loading || topCustomers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {loading ? "Loading..." : "No customer data available"}
                </div>
              ) : (
                <div className="space-y-3">
                  {topCustomers.map((customer, index) => (
                    <div key={customer.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">{customer.email}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">${customer.totalSpent.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{customer.orderCount} orders</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="mt-4 space-y-4">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {/* Bestsellers */}
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  Bestsellers
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {loading || topProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {loading ? "Loading..." : "No data available"}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topProducts.slice(0, 5).map((product, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            #{index + 1}
                          </Badge>
                          <span className="font-medium text-sm truncate max-w-[150px]">{product.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">{product.quantity} sold</p>
                          <p className="text-xs text-muted-foreground">${product.revenue.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Slow Moving */}
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-orange-500" />
                  Slow Moving (High Stock, Low Sales)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {loading || slowMoving.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {loading ? "Loading..." : "No slow-moving items"}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {slowMoving.map((product, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-orange-500/5 border border-orange-500/10">
                        <div className="flex items-center gap-3">
                          <Boxes className="h-4 w-4 text-orange-500" />
                          <span className="font-medium text-sm truncate max-w-[150px]">{product.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">{product.stock} in stock</p>
                          <p className="text-xs text-muted-foreground">{product.quantity} sold</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stock Turnover Chart */}
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Units Sold by Category</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {loading || categorySales.length === 0 ? (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  {loading ? "Loading..." : "No data available"}
                </div>
              ) : (
                <ChartContainer config={{}} className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categorySales}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="category" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={10}
                        tickFormatter={(value) => value.length > 10 ? value.slice(0, 10) + '...' : value}
                      />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                      <Tooltip />
                      <Bar dataKey="quantity" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Units Sold" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analytics;