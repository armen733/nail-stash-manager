import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, PieChart, Pie, Cell } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, DollarSign, Package } from "lucide-react";

interface CategorySales {
  category: string;
  revenue: number;
  quantity: number;
}

interface ProductPerformance {
  name: string;
  revenue: number;
  quantity: number;
  profit: number;
}

const Analytics = () => {
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [topProducts, setTopProducts] = useState<ProductPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month");
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      const now = new Date();
      const periodStart = period === "week"
        ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        : period === "month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(now.getFullYear(), now.getMonth() - 3, 1);

      // Fetch orders with items and products
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(`
          id,
          created_at,
          order_items (
            quantity,
            unit_price,
            line_total,
            products (
              name,
              category,
              price_usd,
              wholesale_price_usd
            )
          )
        `)
        .gte("created_at", periodStart.toISOString());

      if (ordersError) throw ordersError;

      // Calculate category sales
      const categoryMap: Record<string, CategorySales> = {};
      const productMap: Record<string, ProductPerformance> = {};

      orders?.forEach((order) => {
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
  ];

  const totalRevenue = categorySales.reduce((sum, cat) => sum + cat.revenue, 0);
  const totalProfit = topProducts.reduce((sum, prod) => sum + prod.profit, 0);
  const totalQuantity = categorySales.reduce((sum, cat) => sum + cat.quantity, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-1">Detailed sales and performance metrics</p>
        </div>
        <Select value={period} onValueChange={(value: "week" | "month" | "quarter") => setPeriod(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="quarter">Last Quarter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalProfit.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Units Sold</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalQuantity}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle>Sales by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : categorySales.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No data available</div>
            ) : (
              <ChartContainer
                config={{
                  revenue: { label: "Revenue", color: "hsl(var(--primary))" },
                }}
                className="h-[300px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorySales}
                      dataKey="revenue"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => `${entry.category}: $${entry.revenue.toFixed(0)}`}
                    >
                      {categorySales.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle>Top Products by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : topProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No data available</div>
            ) : (
              <ChartContainer
                config={{
                  revenue: { label: "Revenue", color: "hsl(var(--primary))" },
                }}
                className="h-[300px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      width={120}
                    />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle>Product Performance Details</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : topProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4">Product</th>
                    <th className="text-right py-2 px-4">Units Sold</th>
                    <th className="text-right py-2 px-4">Revenue</th>
                    <th className="text-right py-2 px-4">Profit</th>
                    <th className="text-right py-2 px-4">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product, index) => {
                    const margin = product.revenue > 0 ? (product.profit / product.revenue) * 100 : 0;
                    return (
                      <tr key={index} className="border-b">
                        <td className="py-2 px-4">{product.name}</td>
                        <td className="text-right py-2 px-4">{product.quantity}</td>
                        <td className="text-right py-2 px-4">${product.revenue.toFixed(2)}</td>
                        <td className="text-right py-2 px-4">${product.profit.toFixed(2)}</td>
                        <td className="text-right py-2 px-4">{margin.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;
