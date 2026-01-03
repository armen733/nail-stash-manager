import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Package, DollarSign, AlertTriangle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend, Area, AreaChart, BarChart, Bar, Tooltip } from "recharts";
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
  image_url?: string;
}

interface StockValue {
  product_name: string;
  stock: number;
  price: number;
  value: number;
  image_url?: string;
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

interface CategorySalesData {
  category: string;
  revenue: number;
  percentage: number;
  color: string;
}

interface DayOfWeekData {
  day: string;
  revenue: number;
  orders: number;
}

interface AOVData {
  date: string;
  aov: number;
}

interface ProfitData {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
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
  const [categorySalesData, setCategorySalesData] = useState<CategorySalesData[]>([]);
  const [dayOfWeekData, setDayOfWeekData] = useState<DayOfWeekData[]>([]);
  const [aovData, setAovData] = useState<AOVData[]>([]);
  const [profitData, setProfitData] = useState<ProfitData[]>([]);
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
        supabase.from("order_items").select("product_id, quantity, line_total, products(name, category, image_url)"),
        supabase.from("products").select("id, name, stock_on_hand, price_usd, reorder_level, image_url"),
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
      const productStats = (orderItemsRes.data || []).reduce((acc: Record<string, { quantity: number; revenue: number; name: string; image_url?: string }>, item) => {
        const productId = item.product_id;
        const productName = item.products?.name || "Unknown";
        const productImage = item.products?.image_url;
        if (!acc[productId]) {
          acc[productId] = { quantity: 0, revenue: 0, name: productName, image_url: productImage };
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
          image_url: p.image_url,
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
          image_url: p.image_url,
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

      // Calculate category sales breakdown
      const categoryColors: string[] = [
        'hsl(210, 70%, 50%)',  // Blue
        'hsl(145, 60%, 45%)',  // Green
        'hsl(45, 85%, 55%)',   // Yellow/Gold
        'hsl(0, 70%, 55%)',    // Red
        'hsl(280, 60%, 55%)',  // Purple
        'hsl(180, 50%, 45%)',  // Teal
      ];

      const categoryStats = (orderItemsRes.data || []).reduce((acc: Record<string, number>, item) => {
        const category = item.products?.category || "Other";
        acc[category] = (acc[category] || 0) + (item.line_total || 0);
        return acc;
      }, {});

      const totalCategoryRevenue = Object.values(categoryStats).reduce((sum, val) => sum + val, 0);
      
      const categorySales = Object.entries(categoryStats)
        .map(([category, revenue], index) => ({
          category,
          revenue,
          percentage: totalCategoryRevenue > 0 ? Math.round((revenue / totalCategoryRevenue) * 100) : 0,
          color: categoryColors[index % categoryColors.length],
        }))
        .sort((a, b) => b.revenue - a.revenue);

      setCategorySalesData(categorySales);

      // Calculate Day of Week data
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayStats = orders.reduce((acc: Record<number, { revenue: number; orders: number }>, order) => {
        const dayNum = new Date(order.created_at).getDay();
        if (!acc[dayNum]) acc[dayNum] = { revenue: 0, orders: 0 };
        acc[dayNum].revenue += order.total || 0;
        acc[dayNum].orders += 1;
        return acc;
      }, {});

      const dayOfWeek = dayNames.map((day, idx) => ({
        day,
        revenue: dayStats[idx]?.revenue || 0,
        orders: dayStats[idx]?.orders || 0,
      }));
      setDayOfWeekData(dayOfWeek);

      // Calculate AOV (Average Order Value) trend
      const aovTrend: AOVData[] = trendData.map((d, idx) => {
        const dayOrders = orders.filter(o => {
          const date = new Date();
          date.setDate(date.getDate() - (days - 1 - idx));
          const dateStr = date.toISOString().split('T')[0];
          return new Date(o.created_at).toISOString().split('T')[0] === dateStr;
        });
        const orderCount = dayOrders.length;
        const totalRev = dayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        return {
          date: d.date,
          aov: orderCount > 0 ? totalRev / orderCount : 0,
        };
      });
      setAovData(aovTrend);

      // Calculate Profit Margins (simplified - using wholesale vs sale price)
      const profitTrend: ProfitData[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        let dayRevenue = 0;
        let dayCost = 0;
        
        orders.filter(o => new Date(o.created_at).toISOString().split('T')[0] === dateStr)
          .forEach(order => {
            dayRevenue += order.total || 0;
          });
        
        // Estimate cost as 60% of revenue (simplified)
        dayCost = dayRevenue * 0.6;
        const dayProfit = dayRevenue - dayCost;
        const margin = dayRevenue > 0 ? (dayProfit / dayRevenue) * 100 : 0;
        
        profitTrend.push({
          date: timePeriod === "month" ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : date.toLocaleDateString('en-US', { weekday: 'short' }),
          revenue: dayRevenue,
          cost: dayCost,
          profit: dayProfit,
          margin,
        });
      }
      setProfitData(profitTrend);

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
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Welcome to Salon Supply Manager</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Select value={timePeriod} onValueChange={(value: "day" | "week" | "month") => setTimePeriod(value)}>
            <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border">
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={exportDashboardData} variant="outline" size="default" className="min-h-[44px] flex-1 sm:flex-none">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>


      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => (
          <Card key={index} className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold truncate">{stat.value}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sales by Category - FIRST */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base sm:text-lg">Sales by Category</CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              // Export as visual donut chart PNG - matching app style
              const canvas = document.createElement('canvas');
              const size = 800;
              const chartRadius = 130;
              const innerRadius = 75;
              canvas.width = size;
              canvas.height = size + 250;
              const ctx = canvas.getContext('2d')!;
              
              // Background
              ctx.fillStyle = '#1a1a2e';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              const centerX = size / 2;
              const centerY = 240;
              const total = categorySalesData.reduce((sum, d) => sum + d.revenue, 0);
              
              // Draw all slices
              let startAngle = -Math.PI / 2;
              const sliceData: { cat: typeof categorySalesData[0]; midAngle: number }[] = [];
              
              categorySalesData.forEach((cat) => {
                const sliceAngle = (cat.revenue / total) * 2 * Math.PI;
                const endAngle = startAngle + sliceAngle;
                const midAngle = startAngle + sliceAngle / 2;
                
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, chartRadius, startAngle, endAngle);
                ctx.closePath();
                ctx.fillStyle = cat.color;
                ctx.fill();
                
                sliceData.push({ cat, midAngle });
                startAngle = endAngle;
              });
              
              // Draw inner circle (donut hole)
              ctx.beginPath();
              ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
              ctx.fillStyle = '#1a1a2e';
              ctx.fill();
              
              // Draw labels radially around chart (matching app style)
              const labelRadius = chartRadius + 35;
              
              sliceData.forEach(({ cat, midAngle }) => {
                const labelX = centerX + Math.cos(midAngle) * labelRadius;
                const labelY = centerY + Math.sin(midAngle) * labelRadius;
                const edgeX = centerX + Math.cos(midAngle) * (chartRadius + 5);
                const edgeY = centerY + Math.sin(midAngle) * (chartRadius + 5);
                const isRight = labelX > centerX;
                
                // Short connector line
                ctx.beginPath();
                ctx.moveTo(edgeX, edgeY);
                ctx.lineTo(labelX, labelY);
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                // Label text positioned at end of line
                const textX = labelX + (isRight ? 8 : -8);
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = isRight ? 'left' : 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(cat.category, textX, labelY - 8);
                ctx.font = '12px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.fillText(`${cat.percentage}%`, textX, labelY + 8);
              });
              
              // Draw inner circle (donut hole)
              ctx.beginPath();
              ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
              ctx.fillStyle = '#1a1a2e';
              ctx.fill();
              
              // Draw legend below chart
              const legendY = centerY + chartRadius + 100;
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 18px sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText('Revenue Breakdown', 60, legendY);
              
              categorySalesData.forEach((cat, idx) => {
                const rowY = legendY + 40 + idx * 45;
                
                // Color dot
                ctx.beginPath();
                ctx.arc(70, rowY - 5, 10, 0, 2 * Math.PI);
                ctx.fillStyle = cat.color;
                ctx.fill();
                
                // Category name
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 16px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(cat.category, 95, rowY);
                
                // Percentage
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`${cat.percentage}%`, size - 140, rowY);
                
                // Revenue
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 16px sans-serif';
                ctx.fillText(`$${cat.revenue.toFixed(0)}`, size - 60, rowY);
              });
              
              // Download
              const link = document.createElement('a');
              link.download = `sales-by-category-${new Date().toISOString().split('T')[0]}.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
              
              toast({ title: "Success", description: "Sales by category chart exported as image" });
            }}
            disabled={categorySalesData.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : categorySalesData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No sales data yet. Complete orders to see category breakdown.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Donut Chart with outside labels */}
              <div className="w-full min-h-[350px]">
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart margin={{ top: 40, right: 80, bottom: 40, left: 80 }}>
                    <Pie
                      data={categorySalesData}
                      dataKey="revenue"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      label={({ cx, cy, midAngle, outerRadius, category, percentage }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = outerRadius + 30;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        const textAnchor = x > cx ? 'start' : 'end';
                        return (
                          <text
                            x={x}
                            y={y}
                            textAnchor={textAnchor}
                            dominantBaseline="central"
                            fontSize={12}
                            fill="currentColor"
                          >
                            <tspan fontWeight="600">{category}</tspan>
                            <tspan x={x} dy="1.2em" opacity={0.7}>{percentage}%</tspan>
                          </text>
                        );
                      }}
                      labelLine={{
                        stroke: 'currentColor',
                        strokeWidth: 1,
                        strokeOpacity: 0.3,
                      }}
                    >
                      {categorySalesData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip 
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Table */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground mb-3">Revenue Breakdown</div>
                {categorySalesData.map((cat, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm font-medium">{cat.category}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{cat.percentage}%</span>
                      <span className="text-sm font-semibold">${cat.revenue.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between py-3 border-t-2 mt-2">
                  <span className="text-sm font-bold">Total Revenue</span>
                  <span className="text-sm font-bold text-primary">
                    ${categorySalesData.reduce((sum, cat) => sum + cat.revenue, 0).toFixed(0)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue Trend - SECOND */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base sm:text-lg">Revenue Trend</CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              const exportData = revenueData.map(d => ({
                Date: d.date,
                Revenue: `$${d.revenue.toFixed(2)}`,
              }));
              downloadCSV(exportData, 'revenue-trend');
              toast({ title: "Success", description: "Revenue trend exported" });
            }}
            disabled={revenueData.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
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
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
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
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, fill: "hsl(var(--primary))" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg">Top Products</CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={async () => {
                // Export as visual bar chart PNG with thumbnails
                const canvas = document.createElement('canvas');
                canvas.width = 750;
                canvas.height = 500;
                const ctx = canvas.getContext('2d')!;
                
                // Background
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Title
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 24px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText('Top Products', 40, 45);
                
                const barColors = ['hsl(145, 60%, 45%)', 'hsl(210, 70%, 50%)', 'hsl(45, 85%, 55%)', 'hsl(280, 60%, 55%)', 'hsl(0, 70%, 55%)'];
                const maxQty = Math.max(...topProducts.map(p => p.quantity_sold));
                const barHeight = 50;
                const barGap = 20;
                const chartStartY = 80;
                const chartWidth = 420;
                const chartStartX = 260;
                const thumbSize = 40;
                
                // Load all product images first
                const imagePromises = topProducts.map(product => {
                  return new Promise<HTMLImageElement | null>((resolve) => {
                    if (product.image_url) {
                      const img = new Image();
                      img.crossOrigin = 'anonymous';
                      img.onload = () => resolve(img);
                      img.onerror = () => resolve(null);
                      img.src = product.image_url;
                    } else {
                      resolve(null);
                    }
                  });
                });
                
                const images = await Promise.all(imagePromises);
                
                topProducts.forEach((product, idx) => {
                  const y = chartStartY + idx * (barHeight + barGap);
                  const barWidth = (product.quantity_sold / maxQty) * chartWidth;
                  
                  // Draw thumbnail
                  const thumbX = 40;
                  const thumbY = y + (barHeight - thumbSize) / 2;
                  ctx.fillStyle = '#2a2a4a';
                  ctx.beginPath();
                  ctx.roundRect(thumbX, thumbY, thumbSize, thumbSize, 6);
                  ctx.fill();
                  
                  if (images[idx]) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.roundRect(thumbX, thumbY, thumbSize, thumbSize, 6);
                    ctx.clip();
                    ctx.drawImage(images[idx]!, thumbX, thumbY, thumbSize, thumbSize);
                    ctx.restore();
                  } else {
                    // Placeholder icon
                    ctx.fillStyle = 'rgba(255,255,255,0.3)';
                    ctx.font = '16px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('📦', thumbX + thumbSize / 2, thumbY + thumbSize / 2 + 5);
                  }
                  
                  // Product name
                  ctx.fillStyle = '#ffffff';
                  ctx.font = '14px sans-serif';
                  ctx.textAlign = 'right';
                  ctx.fillText(product.product_name.substring(0, 22), chartStartX - 15, y + barHeight / 2 + 5);
                  
                  // Bar
                  ctx.fillStyle = barColors[idx % barColors.length];
                  ctx.beginPath();
                  ctx.roundRect(chartStartX, y, barWidth, barHeight, 4);
                  ctx.fill();
                  
                  // Quantity and revenue on bar
                  ctx.fillStyle = '#ffffff';
                  ctx.font = 'bold 14px sans-serif';
                  ctx.textAlign = 'left';
                  ctx.fillText(`${product.quantity_sold} sold`, chartStartX + barWidth + 10, y + barHeight / 2 - 5);
                  ctx.font = '12px sans-serif';
                  ctx.fillStyle = 'rgba(255,255,255,0.7)';
                  ctx.fillText(`$${product.revenue.toFixed(0)}`, chartStartX + barWidth + 10, y + barHeight / 2 + 12);
                });
                
                // Download
                const link = document.createElement('a');
                link.download = `top-products-${new Date().toISOString().split('T')[0]}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                
                toast({ title: "Success", description: "Top products chart exported as image" });
              }}
              disabled={topProducts.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
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
          <div>
            <CardTitle className="text-base sm:text-lg">Stock Inventory Value</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Total: ${loading ? "..." : totalStockValue.toFixed(2)}</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={async () => {
              // Export as visual stacked bar chart PNG with thumbnails
              const canvas = document.createElement('canvas');
              const itemsToShow = stockValues.slice(0, 10);
              canvas.width = 850;
              canvas.height = 120 + itemsToShow.length * 55;
              const ctx = canvas.getContext('2d')!;
              
              // Background
              ctx.fillStyle = '#1a1a2e';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              // Title
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 24px sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText('Stock Inventory Value', 40, 45);
              ctx.font = '16px sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.7)';
              ctx.fillText(`Total: $${totalStockValue.toFixed(2)}`, 40, 75);
              
              const barColors = ['hsl(210, 70%, 50%)', 'hsl(145, 60%, 45%)', 'hsl(45, 85%, 55%)', 'hsl(280, 60%, 55%)', 'hsl(0, 70%, 55%)', 'hsl(180, 50%, 45%)', 'hsl(320, 60%, 50%)', 'hsl(90, 50%, 45%)', 'hsl(30, 70%, 50%)', 'hsl(250, 50%, 55%)'];
              const maxValue = Math.max(...itemsToShow.map(i => i.value));
              const barHeight = 40;
              const barGap = 15;
              const chartStartY = 100;
              const chartWidth = 380;
              const chartStartX = 280;
              const thumbSize = 34;
              
              // Load all product images first
              const imagePromises = itemsToShow.map(item => {
                return new Promise<HTMLImageElement | null>((resolve) => {
                  if (item.image_url) {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => resolve(img);
                    img.onerror = () => resolve(null);
                    img.src = item.image_url;
                  } else {
                    resolve(null);
                  }
                });
              });
              
              const images = await Promise.all(imagePromises);
              
              itemsToShow.forEach((item, idx) => {
                const y = chartStartY + idx * (barHeight + barGap);
                const barWidth = (item.value / maxValue) * chartWidth;
                
                // Draw thumbnail
                const thumbX = 40;
                const thumbY = y + (barHeight - thumbSize) / 2;
                ctx.fillStyle = '#2a2a4a';
                ctx.beginPath();
                ctx.roundRect(thumbX, thumbY, thumbSize, thumbSize, 5);
                ctx.fill();
                
                if (images[idx]) {
                  ctx.save();
                  ctx.beginPath();
                  ctx.roundRect(thumbX, thumbY, thumbSize, thumbSize, 5);
                  ctx.clip();
                  ctx.drawImage(images[idx]!, thumbX, thumbY, thumbSize, thumbSize);
                  ctx.restore();
                } else {
                  // Placeholder icon
                  ctx.fillStyle = 'rgba(255,255,255,0.3)';
                  ctx.font = '14px sans-serif';
                  ctx.textAlign = 'center';
                  ctx.fillText('📦', thumbX + thumbSize / 2, thumbY + thumbSize / 2 + 5);
                }
                
                // Product name (truncated)
                ctx.fillStyle = '#ffffff';
                ctx.font = '13px sans-serif';
                ctx.textAlign = 'right';
                const displayName = item.product_name.length > 22 ? item.product_name.substring(0, 22) + '...' : item.product_name;
                ctx.fillText(displayName, chartStartX - 15, y + barHeight / 2 + 4);
                
                // Bar
                ctx.fillStyle = barColors[idx % barColors.length];
                ctx.beginPath();
                ctx.roundRect(chartStartX, y, Math.max(barWidth, 5), barHeight, 4);
                ctx.fill();
                
                // Value on right
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(`$${item.value.toFixed(0)}`, chartStartX + barWidth + 12, y + barHeight / 2 - 3);
                ctx.font = '11px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.fillText(`${item.stock} × $${item.price.toFixed(2)}`, chartStartX + barWidth + 12, y + barHeight / 2 + 12);
              });
              
              // Download
              const link = document.createElement('a');
              link.download = `stock-inventory-${new Date().toISOString().split('T')[0]}.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
              
              toast({ title: "Success", description: "Stock inventory chart exported as image" });
            }}
            disabled={stockValues.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
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

      {/* New Analytics Row */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-3">
        {/* Sales by Day of Week */}
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Sales by Day</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayOfWeekData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name === 'revenue' ? `$${value.toFixed(0)}` : value,
                        name === 'revenue' ? 'Revenue' : 'Orders'
                      ]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Average Order Value */}
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg">Avg Order Value</CardTitle>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">
                ${aovData.length > 0 ? (aovData.reduce((sum, d) => sum + d.aov, 0) / aovData.filter(d => d.aov > 0).length || 0).toFixed(0) : '0'}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={aovData}>
                    <defs>
                      <linearGradient id="aovGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(145, 60%, 45%)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(145, 60%, 45%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'AOV']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="aov"
                      stroke="hsl(145, 60%, 45%)"
                      strokeWidth={2}
                      fill="url(#aovGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Profit Margins */}
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg">Profit Margin</CardTitle>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">
                {profitData.length > 0 ? (
                  profitData.reduce((sum, d) => sum + d.margin, 0) / profitData.filter(d => d.margin > 0).length || 0
                ).toFixed(0) : '0'}%
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={profitData}>
                    <defs>
                      <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(280, 60%, 55%)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(280, 60%, 55%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name === 'profit' ? `$${value.toFixed(0)}` : `${value.toFixed(1)}%`,
                        name === 'profit' ? 'Profit' : 'Margin'
                      ]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      stroke="hsl(280, 60%, 55%)"
                      strokeWidth={2}
                      fill="url(#profitGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;