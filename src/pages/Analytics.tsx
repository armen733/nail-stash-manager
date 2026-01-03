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
  BarChart3, ArrowUpRight, ArrowDownRight, Boxes, CalendarIcon, Download, GitCompare, FileText
} from "lucide-react";
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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
  cumulativeRevenue: number;
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
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "custom">("month");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date()
  });
  const [previousPeriodStats, setPreviousPeriodStats] = useState({ revenue: 0, orders: 0, customers: 0 });
  const [showComparison, setShowComparison] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalytics();
  }, [period, dateRange]);

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
          id, created_at, total, profile_id, customer_email, customer_name, status,
          order_items (
            quantity, unit_price, line_total,
            products (name, category, price_usd, wholesale_price_usd, stock_on_hand)
          )
        `)
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString())
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
      const days = eachDayOfInterval({ start: periodStart, end: periodEnd });
      const dailyMap: Record<string, DailyRevenue> = {};
      days.forEach(day => {
        const dateStr = format(day, "MMM dd");
        dailyMap[dateStr] = { date: dateStr, revenue: 0, orders: 0, avgOrderValue: 0, cumulativeRevenue: 0 };
      });

      orders?.forEach(order => {
        const dateStr = format(parseISO(order.created_at), "MMM dd");
        if (dailyMap[dateStr]) {
          dailyMap[dateStr].revenue += order.total || 0;
          dailyMap[dateStr].orders += 1;
        }
      });

      // Calculate avg order value and cumulative revenue
      let cumulative = 0;
      const dailyData = Object.values(dailyMap).map(day => {
        cumulative += day.revenue;
        return {
          ...day,
          avgOrderValue: day.orders > 0 ? day.revenue / day.orders : 0,
          cumulativeRevenue: cumulative
        };
      });
      setDailyRevenue(dailyData);

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

  const StatCard = ({ title, value, icon: Icon, change, prefix = "", previousValue }: { 
    title: string; 
    value: string | number; 
    icon: any; 
    change?: number;
    prefix?: string;
    previousValue?: number;
  }) => (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
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
        <div className="flex items-center gap-3">
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
        <div className="flex gap-2">
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

      {/* KPI Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Revenue" 
          value={totalRevenue.toFixed(2)} 
          icon={DollarSign} 
          change={revenueChange}
          prefix="$"
          previousValue={previousPeriodStats.revenue}
        />
        <StatCard 
          title="Total Orders" 
          value={totalOrders} 
          icon={ShoppingCart} 
          change={ordersChange}
          previousValue={previousPeriodStats.orders}
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
                    <defs>
                      <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.1}/>
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
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cumulative']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cumulativeRevenue" 
                      stroke="#10B981" 
                      strokeWidth={3}
                      dot={false}
                      name="Cumulative Revenue"
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