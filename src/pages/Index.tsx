import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Package, DollarSign, AlertTriangle, Download, X, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend, Area, AreaChart, BarChart, Bar, Tooltip, Sector } from "recharts";
import { Button } from "@/components/ui/button";
import { downloadCSV } from "@/lib/csv-export";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { SalonOrderHistory } from "@/components/salons/SalonOrderHistory";
interface Stats {
  totalOrders: number;
  monthlyOrders: number;
  totalSalons: number;
  totalProducts: number;
  monthlyRevenue: number;
  totalRevenue: number;
}

interface TopSalon {
  salon_id: string | null;
  salon_name: string;
  order_count: number;
  total_revenue: number;
}

interface TopProduct {
  product_id: string;
  product_name: string;
  sku: string;
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

interface CategoryProduct {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  image_url?: string;
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
  const [timePeriod, setTimePeriod] = useState<string>("month");
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [orderStatusData, setOrderStatusData] = useState<OrderStatusData[]>([]);
  const [categorySalesData, setCategorySalesData] = useState<CategorySalesData[]>([]);
  const [dayOfWeekData, setDayOfWeekData] = useState<DayOfWeekData[]>([]);
  const [aovData, setAovData] = useState<AOVData[]>([]);
  const [profitData, setProfitData] = useState<ProfitData[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<CategoryProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [orderItemsData, setOrderItemsData] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const [selectedSalonId, setSelectedSalonId] = useState<string | null>(null);
  const [selectedSalonName, setSelectedSalonName] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  // Custom active shape for pie chart hover effect
  const renderActiveShape = (props: any) => {
    const {
      cx, cy, innerRadius, outerRadius, startAngle, endAngle,
      fill, payload, percent, value
    } = props;
    
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius - 4}
          outerRadius={outerRadius + 10}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))', transition: 'all 0.3s ease' }}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 14}
          outerRadius={outerRadius + 18}
          fill={fill}
        />
        <text x={cx} y={cy - 8} textAnchor="middle" fill="currentColor" className="text-sm font-semibold">
          {payload.category}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="currentColor" className="text-xs opacity-70">
          ${value.toFixed(0)} ({(percent * 100).toFixed(0)}%)
        </text>
      </g>
    );
  };

  useEffect(() => {
    fetchDashboardData();
  }, [timePeriod]);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      let periodStart: string;
      let periodEnd: string | null = null;

      if (timePeriod === "day") {
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (timePeriod === "week") {
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (timePeriod === "month") {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      } else {
        // Specific month: "2026-01", "2026-02", etc.
        const [year, month] = timePeriod.split("-").map(Number);
        periodStart = new Date(year, month - 1, 1).toISOString();
        periodEnd = new Date(year, month, 1).toISOString();
      }

      // Fetch all stats in parallel
      const [ordersRes, salonsRes, productsRes, orderItemsRes, stockRes, productImagesRes] = await Promise.all([
        supabase.from("orders").select("id, total, created_at, salon_id, status, salons(name)"),
        supabase.from("salons").select("id"),
        supabase.from("products").select("id"),
        supabase.from("order_items").select("product_id, quantity, line_total, products(name, sku, category, image_url)"),
        supabase.from("products").select("id, name, stock_on_hand, price_usd, reorder_level, image_url"),
        supabase.from("product_images").select("product_id, image_url, display_order").order("display_order"),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (salonsRes.error) throw salonsRes.error;
      if (productsRes.error) throw productsRes.error;
      if (orderItemsRes.error) throw orderItemsRes.error;
      if (stockRes.error) throw stockRes.error;
      
      // Create a map of product_id -> first image from product_images table
      const productImagesMap: Record<string, string> = {};
      (productImagesRes.data || []).forEach((img: any) => {
        if (!productImagesMap[img.product_id]) {
          productImagesMap[img.product_id] = img.image_url;
        }
      });

      const orders = ordersRes.data || [];
      const periodOrders = orders.filter(o => {
        const d = new Date(o.created_at);
        return d >= new Date(periodStart) && (!periodEnd || d < new Date(periodEnd));
      });

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

      const topSalonsData = Object.entries(salonStats)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 5)
        .map(([id, s]) => ({
          salon_id: id === 'null' ? null : id,
          salon_name: s.name,
          order_count: s.count,
          total_revenue: s.revenue,
        }));
      setTopSalons(topSalonsData);

      // Calculate top products
      const productStats = (orderItemsRes.data || []).reduce((acc: Record<string, { id: string; quantity: number; revenue: number; name: string; sku: string; image_url?: string }>, item) => {
        const productId = item.product_id;
        const productName = item.products?.name || "Unknown";
        const productSku = item.products?.sku || "";
        const productImage = item.products?.image_url || productImagesMap[productId];
        if (!acc[productId]) {
          acc[productId] = { id: productId, quantity: 0, revenue: 0, name: productName, sku: productSku, image_url: productImage };
        }
        acc[productId].quantity += item.quantity || 0;
        acc[productId].revenue += item.line_total || 0;
        return acc;
      }, {});

      const topProductsData = Object.values(productStats)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10)
        .map(p => ({
          product_id: p.id,
          product_name: p.name,
          sku: p.sku,
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
          // Use products.image_url first, fallback to product_images table
          image_url: p.image_url || productImagesMap[p.id],
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

      // Calculate revenue trend data
      const isSpecificMonth = timePeriod.includes("-");
      let days: number;
      let trendStartDate: Date;
      
      if (isSpecificMonth) {
        const [year, month] = timePeriod.split("-").map(Number);
        trendStartDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0); // last day of month
        days = endDate.getDate();
      } else {
        days = timePeriod === "month" ? 30 : 7;
        trendStartDate = new Date();
        trendStartDate.setDate(trendStartDate.getDate() - (days - 1));
      }
      
      const trendData: RevenueData[] = [];
      
      for (let i = 0; i < days; i++) {
        const date = new Date(trendStartDate);
        date.setDate(trendStartDate.getDate() + i);
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

  // Handle category click for drill-down
  const handleCategoryClick = async (category: string) => {
    setSelectedCategory(category);
    setLoadingProducts(true);
    
    try {
      // Fetch products for this category with their sales data
      const [orderItemsRes, productImagesRes] = await Promise.all([
        supabase
          .from("order_items")
          .select("product_id, quantity, line_total, products(id, name, category, image_url)")
          .eq("products.category", category),
        supabase
          .from("product_images")
          .select("product_id, image_url, display_order")
          .order("display_order"),
      ]);
      
      if (orderItemsRes.error) throw orderItemsRes.error;
      
      // Create a map of product_id -> first image from product_images table
      const productImagesMap: Record<string, string> = {};
      (productImagesRes.data || []).forEach((img: any) => {
        if (!productImagesMap[img.product_id]) {
          productImagesMap[img.product_id] = img.image_url;
        }
      });
      
      // Aggregate by product
      const productMap: Record<string, CategoryProduct> = {};
      
      (orderItemsRes.data || []).forEach((item: any) => {
        if (!item.products || item.products.category !== category) return;
        
        const productId = item.product_id;
        if (!productMap[productId]) {
          productMap[productId] = {
            id: productId,
            name: item.products.name,
            quantity: 0,
            revenue: 0,
            // Use products.image_url first, fallback to product_images table
            image_url: item.products.image_url || productImagesMap[productId],
          };
        }
        productMap[productId].quantity += item.quantity || 0;
        productMap[productId].revenue += item.line_total || 0;
      });
      
      const products = Object.values(productMap)
        .sort((a, b) => b.revenue - a.revenue);
      
      setCategoryProducts(products);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingProducts(false);
    }
  };

  const periodLabel = timePeriod === "day" ? "Today's" : timePeriod === "week" ? "Weekly" : timePeriod === "month" ? "Monthly" : (() => {
    const [y, m] = timePeriod.split("-").map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  })();

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
          <Select value={timePeriod} onValueChange={(value: string) => setTimePeriod(value)}>
            <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border max-h-[300px]">
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              {(() => {
                const now = new Date();
                const months = [];
                for (let i = 0; i < 12; i++) {
                  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                  const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  months.push(<SelectItem key={val} value={val}>{label}</SelectItem>);
                }
                return months;
              })()}
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

      {/* Sales by Category - Pie Chart */}
      <Card className="shadow-[var(--shadow-card)] content-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base sm:text-lg">Sales by Category</CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={async () => {
              // Export as visual PNG with donut chart and legend (2x scale)
              const scale = 2;
              const baseWidth = 800;
              const baseHeight = 450;
              const canvas = document.createElement('canvas');
              canvas.width = baseWidth * scale;
              canvas.height = baseHeight * scale;
              const ctx = canvas.getContext('2d')!;
              ctx.scale(scale, scale);
              
              // Background gradient
              const bgGradient = ctx.createLinearGradient(0, 0, baseWidth, baseHeight);
              bgGradient.addColorStop(0, '#1a1a2e');
              bgGradient.addColorStop(1, '#16213e');
              ctx.fillStyle = bgGradient;
              ctx.fillRect(0, 0, baseWidth, baseHeight);
              
              // Title
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText('Sales by Category', 40, 45);
              
              // Date subtitle
              ctx.fillStyle = '#8b8ba3';
              ctx.font = '14px system-ui, -apple-system, sans-serif';
              ctx.fillText(`Generated on ${new Date().toLocaleDateString()}`, 40, 70);
              
              // Draw donut chart
              const centerX = 180;
              const centerY = 260;
              const outerRadius = 120;
              const innerRadius = 70;
              const totalRevenue = categorySalesData.reduce((sum, cat) => sum + cat.revenue, 0);
              
              let startAngle = -Math.PI / 2; // Start from top
              
              categorySalesData.forEach((cat) => {
                const sliceAngle = (cat.revenue / totalRevenue) * 2 * Math.PI;
                const endAngle = startAngle + sliceAngle;
                
                // Draw slice
                ctx.beginPath();
                ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
                ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
                ctx.closePath();
                ctx.fillStyle = cat.color;
                ctx.fill();
                
                // Add subtle shadow between slices
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                startAngle = endAngle;
              });
              
              // Center text
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(`$${totalRevenue.toFixed(0)}`, centerX, centerY - 5);
              ctx.fillStyle = '#8b8ba3';
              ctx.font = '12px system-ui, -apple-system, sans-serif';
              ctx.fillText('Total Revenue', centerX, centerY + 15);
              
              // Legend section
              const legendX = 350;
              const legendStartY = 100;
              const rowHeight = 45;
              
              // Legend header
              ctx.fillStyle = '#8b8ba3';
              ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText('REVENUE BREAKDOWN', legendX, legendStartY);
              
              // Draw legend items
              categorySalesData.forEach((cat, idx) => {
                const y = legendStartY + 30 + idx * rowHeight;
                
                // Color dot
                ctx.beginPath();
                ctx.arc(legendX + 8, y + 8, 8, 0, Math.PI * 2);
                ctx.fillStyle = cat.color;
                ctx.fill();
                
                // Category name
                ctx.fillStyle = '#ffffff';
                ctx.font = '15px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(cat.category, legendX + 28, y + 13);
                
                // Percentage badge
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                const percentText = `${cat.percentage}%`;
                const percentWidth = ctx.measureText(percentText).width + 16;
                ctx.beginPath();
                ctx.roundRect(legendX + 200, y - 2, percentWidth, 24, 12);
                ctx.fill();
                ctx.fillStyle = '#8b8ba3';
                ctx.font = '13px system-ui, -apple-system, sans-serif';
                ctx.fillText(percentText, legendX + 208, y + 13);
                
                // Revenue amount
                ctx.fillStyle = '#10B981';
                ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`$${cat.revenue.toFixed(0)}`, baseWidth - 50, y + 13);
                ctx.textAlign = 'left';
              });
              
              // Total row with separator
              const totalY = legendStartY + 30 + categorySalesData.length * rowHeight + 15;
              ctx.strokeStyle = 'rgba(255,255,255,0.2)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(legendX, totalY - 10);
              ctx.lineTo(baseWidth - 40, totalY - 10);
              ctx.stroke();
              
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText('Total Revenue', legendX, totalY + 10);
              
              ctx.fillStyle = '#10B981';
              ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
              ctx.textAlign = 'right';
              ctx.fillText(`$${totalRevenue.toFixed(0)}`, baseWidth - 50, totalY + 10);
              
              // Add watermark logo (light version for dark background)
              // Position in bottom-left under the donut chart to avoid overlapping with legend/values
              const logo = new Image();
              logo.crossOrigin = 'anonymous';
              logo.onload = () => {
                const logoWidth = 80;
                const logoHeight = logoWidth * (logo.height / logo.width);
                ctx.globalAlpha = 0.5;
                ctx.drawImage(logo, 30, baseHeight - logoHeight - 20, logoWidth, logoHeight);
                ctx.globalAlpha = 1.0;
                
                // Download after logo loads
                const link = document.createElement('a');
                link.download = `sales-by-category-${new Date().toISOString().split('T')[0]}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                
                toast({ title: "Success", description: "Sales by category exported as image" });
              };
              logo.onerror = () => {
                // Download without logo if loading fails
                const link = document.createElement('a');
                link.download = `sales-by-category-${new Date().toISOString().split('T')[0]}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                
                toast({ title: "Success", description: "Sales by category exported as image" });
              };
              logo.src = '/images/nera-logo-light.png';
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Donut Chart - Clickable */}
              <ChartContainer config={{}} className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorySalesData}
                      dataKey="revenue"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      activeIndex={activeIndex}
                      activeShape={renderActiveShape}
                      onMouseEnter={(_, index) => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(undefined)}
                      onClick={(data) => handleCategoryClick(data.category)}
                      style={{ cursor: 'pointer' }}
                    >
                      {categorySalesData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color} 
                          style={{ 
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            opacity: activeIndex !== undefined && activeIndex !== index ? 0.6 : 1
                          }} 
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
              
              {/* Legend Table - Clickable */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground mb-3">
                  Revenue Breakdown
                  <span className="text-xs font-normal ml-2">(Click to drill down)</span>
                </div>
                {categorySalesData.map((cat, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 rounded px-2 -mx-2 transition-colors group"
                    onClick={() => handleCategoryClick(cat.category)}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm font-medium">{cat.category}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{cat.percentage}%</span>
                      <span className="text-sm font-semibold min-w-[70px] text-right">${cat.revenue.toFixed(0)}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-border">
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

      {/* Category Drill-Down Sheet */}
      <Sheet open={!!selectedCategory} onOpenChange={(open) => !open && setSelectedCategory(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {selectedCategory} Products
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            {loadingProducts ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : categoryProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No products found in this category</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground pb-2 border-b">
                  <span>{categoryProducts.length} products</span>
                  <span>
                    Total: ${categoryProducts.reduce((sum, p) => sum + p.revenue, 0).toFixed(2)}
                  </span>
                </div>
                {categoryProducts.map((product, index) => (
                  <div 
                    key={product.id} 
                    className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    {product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt={product.name}
                        className="w-12 h-12 object-cover rounded-md"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.quantity} units sold
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">${product.revenue.toFixed(2)}</p>
                      <Badge variant="secondary" className="text-xs">
                        #{index + 1}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

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
                  <div 
                    key={index} 
                    className={`flex items-center justify-between border-b pb-2 last:border-0 ${salon.salon_id ? 'cursor-pointer hover:bg-muted/50 rounded-lg px-2 py-1 -mx-2 transition-colors' : ''}`}
                    onClick={() => {
                      if (salon.salon_id) {
                        setSelectedSalonId(salon.salon_id);
                        setSelectedSalonName(salon.salon_name);
                      }
                    }}
                  >
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
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  const csvHeader = "SKU,Product Name,Units Sold,Revenue\n";
                  const csvRows = topProducts.map(p => 
                    `"${p.sku}","${p.product_name}",${p.quantity_sold},${p.revenue.toFixed(2)}`
                  ).join('\n');
                  const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
                  const link = document.createElement('a');
                  link.download = `top-products-${new Date().toISOString().split('T')[0]}.csv`;
                  link.href = URL.createObjectURL(blob);
                  link.click();
                  URL.revokeObjectURL(link.href);
                  toast({ title: "Success", description: "Top products exported as CSV" });
                }}
                disabled={topProducts.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                CSV
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={async () => {
                  const scale = 2;
                  const baseWidth = 750;
                  const baseHeight = 500;
                  const canvas = document.createElement('canvas');
                  canvas.width = baseWidth * scale;
                  canvas.height = baseHeight * scale;
                  const ctx = canvas.getContext('2d')!;
                  ctx.scale(scale, scale);
                  
                  ctx.fillStyle = '#1a1a2e';
                  ctx.fillRect(0, 0, baseWidth, baseHeight);
                  
                  ctx.fillStyle = '#ffffff';
                  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
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
                  
                  const loadImage = (url: string): Promise<HTMLImageElement | null> => {
                    return new Promise((resolve) => {
                      const img = new Image();
                      img.crossOrigin = 'anonymous';
                      const timeout = setTimeout(() => resolve(null), 5000);
                      img.onload = () => { clearTimeout(timeout); resolve(img); };
                      img.onerror = () => { clearTimeout(timeout); resolve(null); };
                      img.src = url;
                    });
                  };
                  
                  const images: (HTMLImageElement | null)[] = [];
                  for (const product of topProducts) {
                    if (product.image_url) {
                      const img = await loadImage(product.image_url);
                      images.push(img);
                    } else {
                      images.push(null);
                    }
                  }
                  
                  topProducts.forEach((product, idx) => {
                    const y = chartStartY + idx * (barHeight + barGap);
                    const barWidth = (product.quantity_sold / maxQty) * chartWidth;
                    
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
                      ctx.fillStyle = 'rgba(255,255,255,0.3)';
                      ctx.font = '16px sans-serif';
                      ctx.textAlign = 'center';
                      ctx.fillText('📦', thumbX + thumbSize / 2, thumbY + thumbSize / 2 + 5);
                    }
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '14px sans-serif';
                    ctx.textAlign = 'right';
                    ctx.fillText(product.product_name.substring(0, 22), chartStartX - 15, y + barHeight / 2 + 5);
                    
                    ctx.fillStyle = barColors[idx % barColors.length];
                    ctx.beginPath();
                    ctx.roundRect(chartStartX, y, barWidth, barHeight, 4);
                    ctx.fill();
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 14px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.fillText(`${product.quantity_sold} sold`, chartStartX + barWidth + 10, y + barHeight / 2 - 5);
                    ctx.font = '12px sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.7)';
                    ctx.fillText(`$${product.revenue.toFixed(0)}`, chartStartX + barWidth + 10, y + barHeight / 2 + 12);
                  });
                  
                  const link = document.createElement('a');
                  link.download = `top-products-${new Date().toISOString().split('T')[0]}.png`;
                  link.href = canvas.toDataURL('image/png');
                  link.click();
                  
                  toast({ title: "Success", description: "Top products chart exported as image" });
                }}
                disabled={topProducts.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                PNG
              </Button>
            </div>
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
                  <div 
                    key={index} 
                    className="flex items-center justify-between border-b pb-2 last:border-0 cursor-pointer hover:bg-muted/50 rounded-lg px-2 py-1 -mx-2 transition-colors"
                    onClick={() => navigate(`/products?search=${encodeURIComponent(product.sku || product.product_name)}`)}
                  >
                    <div>
                      <p className="font-medium">{product.product_name}</p>
                      <div className="flex items-center gap-2">
                        {product.sku && (
                          <span className="text-xs text-muted-foreground/60 font-mono">{product.sku}</span>
                        )}
                        <span className="text-sm text-muted-foreground">{product.quantity_sold} sold</span>
                      </div>
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
              // Export as high-quality visual stacked bar chart PNG with ALL products (2x scale)
              const scale = 2;
              const itemsToShow = stockValues; // Show ALL products, not just top 10
              const baseWidth = 850;
              const itemHeight = 55;
              const headerHeight = 100;
              const footerHeight = 20;
              const baseHeight = headerHeight + itemsToShow.length * itemHeight + footerHeight;
              const canvas = document.createElement('canvas');
              canvas.width = baseWidth * scale;
              canvas.height = baseHeight * scale;
              const ctx = canvas.getContext('2d')!;
              ctx.scale(scale, scale);
              
              // Background
              ctx.fillStyle = '#1a1a2e';
              ctx.fillRect(0, 0, baseWidth, baseHeight);
              
              // Title
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText('Stock Inventory Value', 40, 45);
              ctx.font = '16px system-ui, -apple-system, sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.7)';
              ctx.fillText(`Total: $${totalStockValue.toFixed(2)} (${itemsToShow.length} products)`, 40, 75);
              
              const barColors = ['hsl(210, 70%, 50%)', 'hsl(145, 60%, 45%)', 'hsl(45, 85%, 55%)', 'hsl(280, 60%, 55%)', 'hsl(0, 70%, 55%)', 'hsl(180, 50%, 45%)', 'hsl(320, 60%, 50%)', 'hsl(90, 50%, 45%)', 'hsl(30, 70%, 50%)', 'hsl(250, 50%, 55%)'];
              const maxValue = Math.max(...itemsToShow.map(i => i.value));
              const barHeight = 40;
              const barGap = 15;
              const chartStartY = headerHeight;
              const chartWidth = 380;
              const chartStartX = 280;
              const thumbSize = 34;
              
              // Load image with timeout to ensure it loads
              const loadImage = (url: string): Promise<HTMLImageElement | null> => {
                return new Promise((resolve) => {
                  const img = new Image();
                  img.crossOrigin = 'anonymous';
                  const timeout = setTimeout(() => resolve(null), 5000); // 5s timeout
                  img.onload = () => {
                    clearTimeout(timeout);
                    resolve(img);
                  };
                  img.onerror = () => {
                    clearTimeout(timeout);
                    resolve(null);
                  };
                  img.src = url;
                });
              };
              
              // Load all images sequentially to avoid race conditions
              const images: (HTMLImageElement | null)[] = [];
              for (const item of itemsToShow) {
                if (item.image_url) {
                  const img = await loadImage(item.image_url);
                  images.push(img);
                } else {
                  images.push(null);
                }
              }
              
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
              
              toast({ title: "Success", description: `Stock inventory chart exported (${itemsToShow.length} products)` });
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

      <SalonOrderHistory
        salonId={selectedSalonId}
        salonName={selectedSalonName}
        open={!!selectedSalonId}
        onOpenChange={(open) => { if (!open) setSelectedSalonId(null); }}
      />
    </div>
  );
};

export default Index;