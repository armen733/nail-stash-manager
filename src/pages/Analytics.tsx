import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  ResponsiveContainer, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, Sector 
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, TrendingDown, DollarSign, Package, ShoppingCart, Users, 
  BarChart3, ArrowUpRight, ArrowDownRight, Boxes, CalendarIcon, Download, GitCompare, FileText, ChevronRight,
  RefreshCw, AreaChartIcon, LineChartIcon, BarChart2, MapPin
} from "lucide-react";
import { LazyAnalyticsMap } from "@/components/lazy";
import { format, subDays, startOfMonth, startOfWeek, eachDayOfInterval, parseISO, differenceInDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CategoryProduct {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  image_url?: string;
}

interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
  cumulativeRevenue: number;
  prevRevenue?: number;
  prevOrders?: number;
  prevCumulativeRevenue?: number;
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
  const [salonStats, setSalonStats] = useState<{ name: string; revenue: number; orderCount: number; avgOrder: number }[]>([]);
  const [slowMoving, setSlowMoving] = useState<ProductPerformance[]>([]);
  const [totalTaxCollected, setTotalTaxCollected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "custom">("month");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date()
  });
  const [previousPeriodStats, setPreviousPeriodStats] = useState({ revenue: 0, orders: 0, customers: 0 });
  const [showComparison, setShowComparison] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<CategoryProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const [chartType, setChartType] = useState<"area" | "line" | "bar">("area");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const { toast } = useToast();

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

  // Memoized fetch function for auto-refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchAnalytics();
    setLastRefresh(new Date());
    setIsRefreshing(false);
  }, [period, dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [period, dateRange]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      handleRefresh();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [autoRefresh, handleRefresh]);

  const getPeriodDates = () => {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date = now;
    let previousStart: Date;
    let previousEnd: Date;

    if (period === "custom" && dateRange?.from) {
      periodStart = dateRange.from;
      periodEnd = dateRange.to || now;
      const daysDiff = differenceInDays(periodEnd, periodStart);
      previousEnd = subDays(periodStart, 1);
      previousStart = subDays(previousEnd, daysDiff);
    } else if (period === "week") {
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

    return { periodStart, periodEnd, previousStart, previousEnd };
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const { periodStart, periodEnd, previousStart, previousEnd } = getPeriodDates();

      // Fetch current period orders
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(`
          id, created_at, total, tax, profile_id, customer_email, customer_name, status,
          order_items (
            quantity, unit_price, line_total,
            products (name, category, price_usd, cost_usd, wholesale_price_usd, stock_on_hand)
          )
        `)
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString())
        .in("status", ["Confirmed", "Shipped", "Delivered", "Paid"]);

      if (ordersError) throw ordersError;

      // Fetch previous period for comparison (with created_at for daily breakdown)
      const { data: previousOrders } = await supabase
        .from("orders")
        .select("id, total, profile_id, customer_email, created_at")
        .gte("created_at", previousStart.toISOString())
        .lte("created_at", previousEnd.toISOString())
        .in("status", ["Confirmed", "Shipped", "Delivered", "Paid"]);

      // Calculate previous period stats
      const prevRevenue = previousOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
      const prevOrderCount = previousOrders?.length || 0;
      const prevCustomers = new Set(previousOrders?.map(o => o.profile_id || o.customer_email)).size;
      setPreviousPeriodStats({ revenue: prevRevenue, orders: prevOrderCount, customers: prevCustomers });

      // Calculate daily revenue for current period
      const days = eachDayOfInterval({ start: periodStart, end: periodEnd });
      const dailyMap: Record<string, DailyRevenue> = {};
      days.forEach((day, index) => {
        const dateStr = format(day, "MMM dd");
        dailyMap[dateStr] = { 
          date: dateStr, 
          revenue: 0, 
          orders: 0, 
          avgOrderValue: 0, 
          cumulativeRevenue: 0,
          prevRevenue: 0,
          prevOrders: 0,
          prevCumulativeRevenue: 0
        };
      });

      orders?.forEach(order => {
        const dateStr = format(parseISO(order.created_at), "MMM dd");
        if (dailyMap[dateStr]) {
          dailyMap[dateStr].revenue += order.total || 0;
          dailyMap[dateStr].orders += 1;
        }
      });

      // Calculate previous period daily data and map to same day indices
      const prevDays = eachDayOfInterval({ start: previousStart, end: previousEnd });
      const prevDailyMap: Record<number, { revenue: number; orders: number }> = {};
      prevDays.forEach((_, index) => {
        prevDailyMap[index] = { revenue: 0, orders: 0 };
      });

      previousOrders?.forEach(order => {
        const orderDate = parseISO(order.created_at);
        const dayIndex = differenceInDays(orderDate, previousStart);
        if (prevDailyMap[dayIndex]) {
          prevDailyMap[dayIndex].revenue += order.total || 0;
          prevDailyMap[dayIndex].orders += 1;
        }
      });

      // Calculate avg order value and cumulative revenue, merge with previous period
      let cumulative = 0;
      let prevCumulative = 0;
      const dailyData = Object.values(dailyMap).map((day, index) => {
        cumulative += day.revenue;
        const prevDay = prevDailyMap[index] || { revenue: 0, orders: 0 };
        prevCumulative += prevDay.revenue;
        return {
          ...day,
          avgOrderValue: day.orders > 0 ? day.revenue / day.orders : 0,
          cumulativeRevenue: cumulative,
          prevRevenue: prevDay.revenue,
          prevOrders: prevDay.orders,
          prevCumulativeRevenue: prevCumulative
        };
      });
      setDailyRevenue(dailyData);

      // Calculate total tax collected
      const taxCollected = orders?.reduce((sum, o) => sum + (o.tax || 0), 0) || 0;
      setTotalTaxCollected(taxCollected);

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
          
          // Use cost_usd if available, fallback to wholesale_price_usd
          const cost = product.cost_usd || product.wholesale_price_usd || 0;
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

  // Handle category click for drill-down
  const handleCategoryClick = async (category: string) => {
    setSelectedCategory(category);
    setLoadingProducts(true);
    
    try {
      // Fetch order items with product details including parent product and product_images for fallback
      const { data: orderItems, error } = await supabase
        .from("order_items")
        .select(`
          product_id, 
          quantity, 
          line_total, 
          products(
            id, 
            name, 
            category, 
            image_url,
            parent_product_id,
            parent:parent_product_id(image_url),
            product_images(image_url, display_order)
          )
        `)
        .eq("products.category", category);
      
      if (error) throw error;
      
      const productMap: Record<string, CategoryProduct> = {};
      
      (orderItems || []).forEach((item: any) => {
        if (!item.products || item.products.category !== category) return;
        
        const productId = item.product_id;
        if (!productMap[productId]) {
          // Get image with multiple fallbacks:
          // 1. Product's own image_url
          // 2. Parent product's image_url
          // 3. First image from product_images table (sorted by display_order)
          let imageUrl = item.products.image_url;
          
          if (!imageUrl && item.products.parent) {
            imageUrl = item.products.parent.image_url;
          }
          
          if (!imageUrl && item.products.product_images?.length > 0) {
            // Sort by display_order and take the first one
            const sortedImages = [...item.products.product_images].sort(
              (a: any, b: any) => (a.display_order || 0) - (b.display_order || 0)
            );
            imageUrl = sortedImages[0]?.image_url;
          }
          
          productMap[productId] = {
            id: productId,
            name: item.products.name,
            quantity: 0,
            revenue: 0,
            image_url: imageUrl,
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

  // More vibrant distinct colors for pie chart
  const COLORS = [
    "#10B981", // emerald
    "#3B82F6", // blue
    "#F59E0B", // amber
    "#EF4444", // red
    "#8B5CF6", // violet
    "#EC4899", // pink
    "#06B6D4", // cyan
    "#F97316", // orange
    "#84CC16", // lime
    "#6366F1", // indigo
  ];

  // Export analytics to CSV
  const exportToCSV = () => {
    const headers = ["Product", "Units Sold", "Revenue", "Profit", "Margin %"];
    const rows = topProducts.map(p => {
      const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
      return [p.name, p.quantity, p.revenue.toFixed(2), p.profit.toFixed(2), margin.toFixed(1)];
    });
    
    const csvContent = [
      `Analytics Report - ${period === "custom" && dateRange?.from ? format(dateRange.from, "MMM dd, yyyy") + " to " + format(dateRange.to || new Date(), "MMM dd, yyyy") : period}`,
      "",
      `Total Revenue,$${totalRevenue.toFixed(2)}`,
      `Total Orders,${totalOrders}`,
      `Total Profit,$${totalProfit.toFixed(2)}`,
      `Avg Order Value,$${avgOrderValue.toFixed(2)}`,
      "",
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `analytics_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    
    toast({
      title: "Report Exported",
      description: "Analytics report has been downloaded as CSV",
    });
  };

  // Export analytics to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Title
    const periodText = period === "custom" && dateRange?.from 
      ? `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to || new Date(), "MMM dd, yyyy")}`
      : period === "week" ? "Last 7 Days" : period === "month" ? "This Month" : "Last Quarter";
    
    doc.setFontSize(20);
    doc.setTextColor(40);
    doc.text("Analytics Report", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(periodText, pageWidth / 2, 28, { align: "center" });
    doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy HH:mm")}`, pageWidth / 2, 35, { align: "center" });

    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(40);
    doc.text("Summary", 14, 50);
    
    const summaryData = [
      ["Total Revenue", `$${totalRevenue.toFixed(2)}`],
      ["Total Orders", totalOrders.toString()],
      ["Average Order Value", `$${avgOrderValue.toFixed(2)}`],
      ["Total Profit", `$${totalProfit.toFixed(2)}`],
      ["Active Customers", uniqueCustomers.toString()],
    ];

    autoTable(doc, {
      startY: 55,
      head: [["Metric", "Value"]],
      body: summaryData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 },
    });

    // Category Sales
    const categoryY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.text("Sales by Category", 14, categoryY);

    const categoryData = categorySales.map(cat => [
      cat.category,
      cat.quantity.toString(),
      `$${cat.revenue.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: categoryY + 5,
      head: [["Category", "Units Sold", "Revenue"]],
      body: categoryData,
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] },
      margin: { left: 14, right: 14 },
    });

    // Top Products
    const productsY = (doc as any).lastAutoTable.finalY + 15;
    
    // Check if we need a new page
    if (productsY > 250) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text("Top Products Performance", 14, 20);
    } else {
      doc.setFontSize(14);
      doc.text("Top Products Performance", 14, productsY);
    }

    const productData = topProducts.slice(0, 10).map(prod => {
      const margin = prod.revenue > 0 ? (prod.profit / prod.revenue) * 100 : 0;
      return [
        prod.name.length > 25 ? prod.name.slice(0, 25) + "..." : prod.name,
        prod.quantity.toString(),
        `$${prod.revenue.toFixed(2)}`,
        `$${prod.profit.toFixed(2)}`,
        `${margin.toFixed(1)}%`
      ];
    });

    autoTable(doc, {
      startY: productsY > 250 ? 25 : productsY + 5,
      head: [["Product", "Units", "Revenue", "Profit", "Margin"]],
      body: productData,
      theme: "striped",
      headStyles: { fillColor: [139, 92, 246] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 60 },
      },
    });

    // Top Customers
    if (topCustomers.length > 0) {
      const customersY = (doc as any).lastAutoTable.finalY + 15;
      
      if (customersY > 250) {
        doc.addPage();
        doc.setFontSize(14);
        doc.text("Top Customers", 14, 20);
      } else {
        doc.setFontSize(14);
        doc.text("Top Customers", 14, customersY);
      }

      const customerData = topCustomers.map(cust => [
        cust.name,
        cust.email || "-",
        cust.orderCount.toString(),
        `$${cust.totalSpent.toFixed(2)}`
      ]);

      autoTable(doc, {
        startY: customersY > 250 ? 25 : customersY + 5,
        head: [["Customer", "Email", "Orders", "Total Spent"]],
        body: customerData,
        theme: "striped",
        headStyles: { fillColor: [236, 72, 153] },
        margin: { left: 14, right: 14 },
      });
    }

    // Save the PDF
    doc.save(`analytics_report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    
    toast({
      title: "PDF Exported",
      description: "Analytics report has been downloaded as PDF",
    });
  };

  // Memoize expensive KPI calculations
  const { totalRevenue, totalOrders, avgOrderValue, totalProfit, uniqueCustomers } = useMemo(() => {
    const revenue = dailyRevenue.reduce((sum, d) => sum + d.revenue, 0);
    const orders = dailyRevenue.reduce((sum, d) => sum + d.orders, 0);
    return {
      totalRevenue: revenue,
      totalOrders: orders,
      avgOrderValue: orders > 0 ? revenue / orders : 0,
      totalProfit: topProducts.reduce((sum, prod) => sum + prod.profit, 0),
      uniqueCustomers: topCustomers.length,
    };
  }, [dailyRevenue, topProducts, topCustomers]);

  // Memoize percentage change calculations
  const { revenueChange, ordersChange } = useMemo(() => ({
    revenueChange: previousPeriodStats.revenue > 0 
      ? ((totalRevenue - previousPeriodStats.revenue) / previousPeriodStats.revenue) * 100 
      : 0,
    ordersChange: previousPeriodStats.orders > 0 
      ? ((totalOrders - previousPeriodStats.orders) / previousPeriodStats.orders) * 100 
      : 0,
  }), [totalRevenue, totalOrders, previousPeriodStats]);

  // Mini sparkline component for KPI cards
  const Sparkline = ({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) => (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.slice(-7)}>
          <defs>
            <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <Area 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            strokeWidth={1.5}
            fill={`url(#spark-${dataKey})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  const StatCard = ({ title, value, icon: Icon, change, prefix = "", previousValue, sparkData, sparkKey, sparkColor }: { 
    title: string; 
    value: string | number; 
    icon: any; 
    change?: number;
    prefix?: string;
    previousValue?: number;
    sparkData?: any[];
    sparkKey?: string;
    sparkColor?: string;
  }) => (
    <Card className="shadow-[var(--shadow-card)] overflow-hidden">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs sm:text-sm text-muted-foreground">{title}</p>
            <p className="text-xl sm:text-2xl font-bold mt-1">{prefix}{value}</p>
            {showComparison && change !== undefined && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                <span>{Math.abs(change).toFixed(1)}% vs last period</span>
              </div>
            )}
            {showComparison && previousValue !== undefined && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Previous: {prefix}{typeof previousValue === 'number' ? previousValue.toFixed(2) : previousValue}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="p-2.5 rounded-full bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            {sparkData && sparkKey && sparkColor && (
              <Sparkline data={sparkData} dataKey={sparkKey} color={sparkColor} />
            )}
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
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={period} onValueChange={(value: "week" | "month" | "quarter" | "custom") => setPeriod(value)}>
            <SelectTrigger className="w-full sm:w-[160px] h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">Last Quarter</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          
          {period === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full sm:w-[280px] justify-start text-left font-normal h-11",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="comparison"
              checked={showComparison}
              onCheckedChange={setShowComparison}
            />
            <Label htmlFor="comparison" className="text-sm flex items-center gap-2">
              <GitCompare className="h-4 w-4" />
              Period Comparison
            </Label>
          </div>
          <div className="h-6 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <Switch
              id="autoRefresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="autoRefresh" className="text-sm flex items-center gap-2">
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              Auto-refresh
            </Label>
          </div>
          {autoRefresh && (
            <span className="text-xs text-muted-foreground">
              Last: {format(lastRefresh, "HH:mm:ss")}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={handleRefresh} 
            disabled={isRefreshing}
            className="h-10 w-10"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <Button variant="outline" onClick={() => setShowMap(true)} className="h-10">
            <MapPin className="mr-2 h-4 w-4" />
            Map
          </Button>
          <Button variant="outline" onClick={exportToCSV} className="h-10">
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" onClick={exportToPDF} className="h-10">
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* Analytics Map Dialog - Lazy loaded */}
      <LazyAnalyticsMap 
        open={showMap} 
        onOpenChange={setShowMap}
        dateRange={dateRange?.from && dateRange?.to ? { from: dateRange.from, to: dateRange.to } : undefined}
      />

      {/* KPI Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard 
          title="Total Revenue" 
          value={totalRevenue.toFixed(2)} 
          icon={DollarSign} 
          change={revenueChange}
          prefix="$"
          previousValue={previousPeriodStats.revenue}
          sparkData={dailyRevenue}
          sparkKey="revenue"
          sparkColor="#10B981"
        />
        <StatCard 
          title="Total Orders" 
          value={totalOrders} 
          icon={ShoppingCart} 
          change={ordersChange}
          previousValue={previousPeriodStats.orders}
          sparkData={dailyRevenue}
          sparkKey="orders"
          sparkColor="#3B82F6"
        />
        <StatCard 
          title="Avg Order Value" 
          value={avgOrderValue.toFixed(2)} 
          icon={TrendingUp}
          prefix="$"
          sparkData={dailyRevenue.filter(d => d.orders > 0)}
          sparkKey="avgOrderValue"
          sparkColor="#8B5CF6"
        />
        <StatCard 
          title="Total Profit" 
          value={totalProfit.toFixed(2)} 
          icon={TrendingUp}
          prefix="$"
        />
        <StatCard 
          title="Tax Collected" 
          value={totalTaxCollected.toFixed(2)} 
          icon={DollarSign}
          prefix="$"
        />
      </div>

      {/* Revenue Trend Chart */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Revenue & Orders Trend
            </CardTitle>
            <ToggleGroup 
              type="single" 
              value={chartType} 
              onValueChange={(value) => value && setChartType(value as "area" | "line" | "bar")}
              className="bg-muted/50 rounded-lg p-1"
            >
              <ToggleGroupItem value="area" aria-label="Area chart" className="h-8 w-8 p-0">
                <AreaChartIcon className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="line" aria-label="Line chart" className="h-8 w-8 p-0">
                <LineChartIcon className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="bar" aria-label="Bar chart" className="h-8 w-8 p-0">
                <BarChart2 className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading...</div>
          ) : (
            <ChartContainer config={{}} className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "bar" ? (
                  <BarChart data={dailyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number, name: string) => [
                        name === "orders" ? value : `$${value.toFixed(2)}`,
                        name
                      ]}
                    />
                    <Legend />
                    {showComparison && (
                      <Bar 
                        dataKey="prevRevenue" 
                        fill="#94A3B8"
                        radius={[4, 4, 0, 0]}
                        name="Previous Period"
                      />
                    )}
                    <Bar 
                      dataKey="revenue" 
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                      name="Current Revenue"
                    />
                  </BarChart>
                ) : chartType === "line" ? (
                  <LineChart data={dailyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number, name: string) => [
                        name === "orders" ? value : `$${value.toFixed(2)}`,
                        name
                      ]}
                    />
                    <Legend />
                    {showComparison && (
                      <Line 
                        type="monotone" 
                        dataKey="prevRevenue" 
                        stroke="#94A3B8" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        name="Previous Period"
                      />
                    )}
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5 }}
                      name="Current Revenue"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="orders" 
                      stroke="hsl(var(--chart-2))" 
                      strokeWidth={2}
                      dot={false}
                      name="Orders"
                    />
                  </LineChart>
                ) : (
                  <AreaChart data={dailyRevenue}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPrevRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94A3B8" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#94A3B8" stopOpacity={0}/>
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
                      formatter={(value: number, name: string) => [
                        name === "orders" ? value : `$${value.toFixed(2)}`,
                        name
                      ]}
                    />
                    <Legend />
                    {showComparison && (
                      <Area 
                        type="monotone" 
                        dataKey="prevRevenue" 
                        stroke="#94A3B8" 
                        strokeDasharray="5 5"
                        fillOpacity={1} 
                        fill="url(#colorPrevRevenue)" 
                        name="Previous Period"
                      />
                    )}
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(var(--primary))" 
                      fillOpacity={1} 
                      fill="url(#colorRevenue)" 
                      name="Current Revenue"
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
                )}
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Additional Charts Row */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Cumulative Revenue Line Chart */}
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Cumulative Revenue
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {loading ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">Loading...</div>
            ) : (
              <ChartContainer config={{}} className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
                    />
                    <Legend />
                    {showComparison && (
                      <Line 
                        type="monotone" 
                        dataKey="prevCumulativeRevenue" 
                        stroke="#94A3B8" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        name="Previous Period"
                      />
                    )}
                    <Line 
                      type="monotone" 
                      dataKey="cumulativeRevenue" 
                      stroke="#10B981" 
                      strokeWidth={3}
                      dot={false}
                      name="Current Period"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Average Order Value Trend */}
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-500" />
              Avg Order Value Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {loading ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">Loading...</div>
            ) : (
              <ChartContainer config={{}} className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyRevenue.filter(d => d.orders > 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Avg Order']}
                    />
                    <Bar 
                      dataKey="avgOrderValue" 
                      fill="#8B5CF6" 
                      radius={[4, 4, 0, 0]}
                      name="Avg Order Value"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Orders Volume Chart */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-blue-500" />
            Daily Orders Volume
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">Loading...</div>
          ) : (
            <ChartContainer config={{}} className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyRevenue}>
                  <defs>
                    <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="stepAfter" 
                    dataKey="orders" 
                    stroke="#3B82F6" 
                    fillOpacity={1} 
                    fill="url(#colorOrders)" 
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
            {/* Category Sales Pie - Clickable */}
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">
                  Sales by Category
                  <span className="text-xs font-normal text-muted-foreground ml-2">(Click to drill down)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {loading || categorySales.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                    {loading ? "Loading..." : "No data available"}
                  </div>
                ) : (
                  <div className="flex flex-col lg:flex-row items-center gap-4">
                    <ChartContainer config={{}} className="h-[220px] w-full lg:w-1/2">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categorySales}
                            dataKey="revenue"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={2}
                            activeIndex={activeIndex}
                            activeShape={renderActiveShape}
                            onMouseEnter={(_, index) => setActiveIndex(index)}
                            onMouseLeave={() => setActiveIndex(undefined)}
                            onClick={(data) => handleCategoryClick(data.category)}
                            style={{ cursor: 'pointer' }}
                          >
                            {categorySales.map((_, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={COLORS[index % COLORS.length]} 
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
                    {/* Legend with percentages */}
                    <div className="w-full lg:w-1/2 space-y-2">
                      {(() => {
                        const totalCategoryRevenue = categorySales.reduce((sum, cat) => sum + cat.revenue, 0);
                        return categorySales.map((cat, index) => {
                          const percent = totalCategoryRevenue > 0 ? (cat.revenue / totalCategoryRevenue) * 100 : 0;
                          return (
                            <div 
                              key={cat.category}
                              className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                              onClick={() => handleCategoryClick(cat.category)}
                              onMouseEnter={() => setActiveIndex(index)}
                              onMouseLeave={() => setActiveIndex(undefined)}
                            >
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                />
                                <span className="text-sm font-medium">{cat.category}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground">${cat.revenue.toFixed(0)}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {percent.toFixed(1)}%
                                </Badge>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
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

          {/* Profit Margins Section */}
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                Profit Margins by Product
                <span className="text-xs font-normal text-muted-foreground ml-2">(Based on Cost vs Selling Price)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {loading || topProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {loading ? "Loading..." : "No data available"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground">Product</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Units Sold</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Revenue</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Profit</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Margin</th>
                        <th className="py-3 px-2 w-32"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((product, index) => {
                        const margin = product.revenue > 0 ? (product.profit / product.revenue) * 100 : 0;
                        return (
                          <tr key={index} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-2">
                              <span className="font-medium truncate max-w-[200px] inline-block">{product.name}</span>
                            </td>
                            <td className="text-right py-3 px-2 tabular-nums">{product.quantity}</td>
                            <td className="text-right py-3 px-2 tabular-nums text-primary font-medium">${product.revenue.toFixed(2)}</td>
                            <td className="text-right py-3 px-2 tabular-nums text-green-500 font-medium">${product.profit.toFixed(2)}</td>
                            <td className="text-right py-3 px-2">
                              <Badge 
                                variant={margin > 40 ? "default" : margin > 20 ? "secondary" : "outline"}
                                className={cn(
                                  "font-medium",
                                  margin > 40 && "bg-green-500 hover:bg-green-600",
                                  margin <= 20 && margin > 0 && "text-amber-600 border-amber-300",
                                  margin <= 0 && "text-red-600 border-red-300"
                                )}
                              >
                                {margin.toFixed(1)}%
                              </Badge>
                            </td>
                            <td className="py-3 px-2">
                              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    margin > 40 ? "bg-green-500" : margin > 20 ? "bg-primary" : margin > 0 ? "bg-amber-500" : "bg-red-500"
                                  )}
                                  style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {/* Summary Row */}
                  <div className="mt-4 p-3 rounded-lg bg-muted/50 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Overall Margin:</span>
                      <Badge 
                        variant="default"
                        className={cn(
                          "text-sm",
                          totalRevenue > 0 && (totalProfit / totalRevenue) * 100 > 30 
                            ? "bg-green-500 hover:bg-green-600" 
                            : ""
                        )}
                      >
                        {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Revenue:</span>
                        <span className="ml-2 font-bold text-primary">${totalRevenue.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total Profit:</span>
                        <span className="ml-2 font-bold text-green-500">${totalProfit.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Product Performance Cards */}
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
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {topProducts.map((product, index) => {
                    const margin = product.revenue > 0 ? (product.profit / product.revenue) * 100 : 0;
                    return (
                      <div key={index} className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-medium text-sm truncate flex-1">{product.name}</p>
                          <Badge 
                            variant={margin > 30 ? "default" : margin > 15 ? "secondary" : "outline"}
                            className="shrink-0"
                          >
                            {margin.toFixed(0)}%
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-lg font-bold">{product.quantity}</p>
                            <p className="text-[10px] text-muted-foreground">Units</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-primary">${product.revenue.toFixed(0)}</p>
                            <p className="text-[10px] text-muted-foreground">Revenue</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-green-500">${product.profit.toFixed(0)}</p>
                            <p className="text-[10px] text-muted-foreground">Profit</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                      <defs>
                        {categorySales.map((_, index) => (
                          <linearGradient key={`gradient-${index}`} id={`colorGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"][index % 8]} stopOpacity={1} />
                            <stop offset="100%" stopColor={["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"][index % 8]} stopOpacity={0.6} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="category" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={10}
                        tickFormatter={(value) => value.length > 10 ? value.slice(0, 10) + "..." : value}
                      />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                      <Tooltip />
                      <Bar 
                        dataKey="quantity" 
                        radius={[4, 4, 0, 0]} 
                        name="Units Sold"
                      >
                        {categorySales.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={`url(#colorGradient-${index})`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
    </div>
  );
};

export default Analytics;