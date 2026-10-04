import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Package, DollarSign, AlertTriangle, Download, X, ChevronRight, ChevronDown, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend, Area, AreaChart, BarChart, Bar, Tooltip, Sector } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toLocalDateStr, todayLocalStr, getLocalDay, formatLocalDate } from "@/lib/timezone";
import { downloadCSV } from "@/lib/csv-export";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { SalonOrderHistory } from "@/components/salons/SalonOrderHistory";
import { SupplyStoreStockHistory } from "@/components/supply-stores/SupplyStoreStockHistory";
import { displayName } from "@/lib/displayName";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
interface Stats {
  totalOrders: number;
  monthlyOrders: number;
  periodWebsiteOrders: number;
  totalWebsiteOrders: number;
  totalSalons: number;
  activeSupplyStores: number;
  totalProducts: number;
  periodSkus: number;
  periodSkusFromOrders: number;
  periodSkusFromSupply: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  websiteRevenue: number;
  websiteProfit: number;
  salonRevenue: number;
  salonProfit: number;
  totalRevenue: number;
  supplyStoreRevenue: number;
  supplyStoreProfit: number;
  supplyStoreUnits: number;
  websiteUsers: number;
  newWebsiteUsers: number;
}

interface TopSalon {
  salon_id: string | null;
  salon_name: string;
  order_count: number;
  total_revenue: number;
  is_website?: boolean;
  profile_id?: string | null;
  customer_key?: string;
}

interface WebsiteOrderRow {
  id: string;
  total: number;
  created_at: string;
  status: string;
  customer_key: string;
  customer_name: string;
  profile_id: string | null;
}

interface TopSupplyStore {
  store_id: string;
  store_name: string;
  shipment_count: number;
  units: number;
  revenue: number;
}

interface TopProduct {
  product_id: string;
  product_name: string;
  sku: string;
  quantity_sold: number;
  revenue: number;
  supplier_sku?: string;
  image_url?: string;
}

interface StockValue {
  product_name: string;
  sku: string;
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
  sku?: string;
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
    periodWebsiteOrders: 0,
    totalWebsiteOrders: 0,
    totalSalons: 0,
    activeSupplyStores: 0,
    totalProducts: 0,
    periodSkus: 0,
    periodSkusFromOrders: 0,
    periodSkusFromSupply: 0,
    monthlyRevenue: 0,
    monthlyProfit: 0,
    websiteRevenue: 0,
    websiteProfit: 0,
    salonRevenue: 0,
    salonProfit: 0,
    totalRevenue: 0,
    supplyStoreRevenue: 0,
    supplyStoreProfit: 0,
    supplyStoreUnits: 0,
    websiteUsers: 0,
    newWebsiteUsers: 0,
  });
  // 0 = Revenue, 1 = Clean Profit, 2 = Website Revenue, 3 = Website Clean Profit
  const [revenueView, setRevenueView] = useState(0);
  // 0 = Salon count, 1 = Salon Revenue, 2 = Salon Clean Profit, 3 = Supply Stores
  const [salonCardView, setSalonCardView] = useState(0);
  const [productCardView, setProductCardView] = useState(0);
  const [orderCardView, setOrderCardView] = useState(0);
  const [showSupplyAsProfit, setShowSupplyAsProfit] = useState(false);
  const [topSalons, setTopSalons] = useState<TopSalon[]>([]);
  const [allSalons, setAllSalons] = useState<TopSalon[]>([]);
  const [websiteOrders, setWebsiteOrders] = useState<WebsiteOrderRow[]>([]);
  const [websiteCustomersOpen, setWebsiteCustomersOpen] = useState(false);
  const [selectedWebsiteCustomer, setSelectedWebsiteCustomer] = useState<{ key: string; name: string; profile_id: string | null } | null>(null);
  const websiteCustomers = Object.values(
    websiteOrders.reduce((acc, o) => {
      if (!acc[o.customer_key]) acc[o.customer_key] = { key: o.customer_key, name: o.customer_name, profile_id: o.profile_id, count: 0, revenue: 0 };
      acc[o.customer_key].count += 1;
      acc[o.customer_key].revenue += o.total;
      if (!acc[o.customer_key].profile_id && o.profile_id) acc[o.customer_key].profile_id = o.profile_id;
      return acc;
    }, {} as Record<string, { key: string; name: string; profile_id: string | null; count: number; revenue: number }>)
  ).sort((a, b) => b.revenue - a.revenue);
  const [showAllSalons, setShowAllSalons] = useState(false);
  const [topSupplyStores, setTopSupplyStores] = useState<TopSupplyStore[]>([]);
  const [allSupplyStores, setAllSupplyStores] = useState<TopSupplyStore[]>([]);
  const [showAllSupplyStores, setShowAllSupplyStores] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedStoreName, setSelectedStoreName] = useState("");
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [stockValues, setStockValues] = useState<StockValue[]>([]);
  const [totalStockValue, setTotalStockValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [topProductsOpen, setTopProductsOpen] = useState(false);
  const [topSupplyStoresOpen, setTopSupplyStoresOpen] = useState(false);
  const [stockValueOpen, setStockValueOpen] = useState(false);
  // Read-only parse — never consume storage during render (StrictMode discards
  // the first render, which would wipe the stored value from the ref).
  const readDashboardReturn = () => {
    try {
      const raw = sessionStorage.getItem("dashboardReturn");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  };
  const initialReturn = readDashboardReturn();
  const dashboardReturn = useRef<{ timePeriod?: string; customStart?: string; customEnd?: string; category?: string | null; topProducts?: boolean } | null>(initialReturn);
  const [timePeriod, setTimePeriod] = useState<string>(initialReturn?.timePeriod || "month");
  const [customStart, setCustomStart] = useState<string>(initialReturn?.customStart || "");
  const [customEnd, setCustomEnd] = useState<string>(initialReturn?.customEnd || "");
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [orderStatusData, setOrderStatusData] = useState<OrderStatusData[]>([]);
  const [categorySalesData, setCategorySalesData] = useState<CategorySalesData[]>([]);
  const [dayOfWeekData, setDayOfWeekData] = useState<DayOfWeekData[]>([]);
  const [aovData, setAovData] = useState<AOVData[]>([]);
  const [profitData, setProfitData] = useState<ProfitData[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<CategoryProduct[]>([]);
  // Order ids inside the currently selected period, so the category drill-down
  // shows the same window the Sales by Category chart uses.
  const periodOrderIdsRef = useRef<Set<string>>(new Set());
  const periodSupplySalesRef = useRef<Array<{ product_id: string; quantity: number; revenue: number }>>([]);
  const productInfoRef = useRef<Map<string, { name: string; sku: string; category: string; image_url?: string; supplier_sku?: string }>>(new Map());
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [orderItemsData, setOrderItemsData] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const [selectedSalonId, setSelectedSalonId] = useState<string | null>(null);
  const [selectedSalonName, setSelectedSalonName] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSalonEntryClick = (salon: TopSalon) => {
    if (salon.salon_id) {
      setSelectedSalonId(salon.salon_id);
      setSelectedSalonName(salon.salon_name);
    } else if (salon.is_website) {
      setSelectedWebsiteCustomer(null);
      setWebsiteCustomersOpen(true);
    }
  };

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

  const openProductFromDashboard = (product: { sku?: string; name?: string }, withCategory: boolean) => {
    try {
      sessionStorage.setItem("dashboardReturn", JSON.stringify({
        timePeriod, customStart, customEnd,
        category: withCategory ? selectedCategory : null,
        topProducts: !withCategory && topProductsOpen,
      }));
    } catch {}
    navigate(`/products?search=${encodeURIComponent(product.sku || product.name || "")}&from=dashboard`);
  };

  useEffect(() => {
    if (loading) return;
    const ret = readDashboardReturn();
    if (!ret) return;
    // Consume only now that we're sure we can restore.
    try { sessionStorage.removeItem("dashboardReturn"); } catch {}
    dashboardReturn.current = null;
    if (ret.timePeriod && ret.timePeriod !== timePeriod) setTimePeriod(ret.timePeriod);
    if (ret.customStart) setCustomStart(ret.customStart);
    if (ret.customEnd) setCustomEnd(ret.customEnd);
    if (ret.topProducts) setTopProductsOpen(true);
    if (ret.category) handleCategoryClick(ret.category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (timePeriod === "custom" && (!customStart || !customEnd)) return;
    fetchDashboardData();
  }, [timePeriod, customStart, customEnd]);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      let periodStart: string;
      let periodEnd: string | null = null;

      if (timePeriod === "day") {
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (timePeriod === "week") {
        // Start from Monday of the current week
        const dayOfWeek = now.getDay(); // 0=Sun
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
        periodStart = monday.toISOString();
      } else if (timePeriod === "month") {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      } else if (timePeriod === "custom") {
        const [sy, sm, sd] = customStart.split("-").map(Number);
        const [ey, em, ed] = customEnd.split("-").map(Number);
        periodStart = new Date(sy, sm - 1, sd).toISOString();
        periodEnd = new Date(ey, em - 1, ed + 1).toISOString();
      } else {
        // Specific month: "2026-01", "2026-02", etc.
        const [year, month] = timePeriod.split("-").map(Number);
        periodStart = new Date(year, month - 1, 1).toISOString();
        periodEnd = new Date(year, month, 1).toISOString();
      }


      // Fetch all stats in parallel
      const [ordersRes, salonsRes, productsRes, orderItemsRes, stockRes, productImagesRes, supplyStoresRes, supplyStoreLocsRes, supplyMovementsRes, productPricingRes, supplyOverridesRes, profilesRes] = await Promise.all([
        supabase.from("orders").select("id, total, tax, created_at, salon_id, status, created_by, customer_name, customer_email, profile_id, salons(name)"),
        supabase.from("salons").select("id"),
        supabase.from("products").select("id"),
        supabase.from("order_items").select("order_id, product_id, quantity, line_total, products(name, sku, category, image_url, supplier_sku)"),
        supabase.from("products").select("id, name, sku, stock_on_hand, price_usd, reorder_level, image_url"),
        supabase.from("product_images").select("product_id, image_url, display_order").order("display_order"),
        supabase.from("supply_stores").select("id, name, default_discount_percent, status"),
        supabase.from("stock_locations").select("id, supply_store_id").not("supply_store_id", "is", null),
        supabase.from("stock_movements").select("product_id, quantity, unit_cost, to_location_id, from_location_id, created_at, movement_type, reason"),
        supabase.from("products").select("id, name, sku, category, image_url, supplier_sku, wholesale_price_usd, price_usd, cost_usd"),
        supabase.from("supply_store_products").select("supply_store_id, product_id, discount_percent_override"),
        supabase.from("profiles").select("id, created_at, role"),
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

      // ===== Supply store revenue calculation =====
      // Stock leaving our warehouse INTO a supply store location = a wholesale sale to that store.
      // Revenue = qty * (per-product override OR wholesale_price * (1 - storeDiscount%))
      // Profit = revenue - (qty * cost_usd or movement.unit_cost)
      const storeLocMap = new Map<string, string>(); // location_id -> supply_store_id
      (supplyStoreLocsRes.data || []).forEach((l: any) => {
        if (l.supply_store_id) storeLocMap.set(l.id, l.supply_store_id);
      });
      const storeDiscountMap = new Map<string, number>();
      (supplyStoresRes.data || []).forEach((s: any) => {
        storeDiscountMap.set(s.id, Number(s.default_discount_percent) || 0);
      });
      const productInfoMap = new Map<string, { name: string; sku: string; category: string; image_url?: string; supplier_sku?: string }>();
      (productPricingRes.data || []).forEach((p: any) => {
        productInfoMap.set(p.id, { name: p.name || "Unknown", sku: p.sku || "", category: p.category || "Other", image_url: productImagesMap[p.id] || p.image_url || undefined, supplier_sku: p.supplier_sku || "" });
      });
      const productPricingMap = new Map<string, { wholesale: number; retail: number; cost: number }>();
      (productPricingRes.data || []).forEach((p: any) => {
        productPricingMap.set(p.id, {
          wholesale: Number(p.wholesale_price_usd ?? p.price_usd ?? 0),
          retail: Number(p.price_usd ?? 0),
          cost: Number(p.cost_usd ?? 0),
        });
      });
      const overrideMap = new Map<string, number>(); // `${storeId}:${productId}` -> override discount %
      (supplyOverridesRes.data || []).forEach((o: any) => {
        if (o.discount_percent_override !== null && o.discount_percent_override !== undefined) {
          overrideMap.set(`${o.supply_store_id}:${o.product_id}`, Number(o.discount_percent_override));
        }
      });

      const computeSupplyMovementValue = (m: any) => {
        const storeId = m.to_location_id ? storeLocMap.get(m.to_location_id) : null;
        if (!storeId) return null;
        const pricing = productPricingMap.get(m.product_id);
        if (!pricing) return null;
        const overrideKey = `${storeId}:${m.product_id}`;
        const discountPct = overrideMap.has(overrideKey)
          ? overrideMap.get(overrideKey)!
          : (storeDiscountMap.get(storeId) ?? 0);
        const sellPrice = pricing.wholesale * (1 - discountPct / 100);
        // Use product's true cost_usd (COGS), not movement.unit_cost — for supply-store
        // transfers, unit_cost is recorded as the wholesale sell price, which would zero out profit.
        const unitCost = pricing.cost > 0
          ? pricing.cost
          : (m.unit_cost != null ? Number(m.unit_cost) : 0);
        return {
          revenue: sellPrice * m.quantity,
          cost: unitCost * m.quantity,
          units: m.quantity,
        };
      };

      const allSupplyMovements = (supplyMovementsRes.data || []).filter(
        (m: any) =>
          (m.movement_type === "transfer" || m.movement_type === "sale" || m.movement_type === "receive") &&
          m.to_location_id &&
          storeLocMap.has(m.to_location_id),
      );
      let supplyStoreRevenue = 0;
      let supplyStoreProfit = 0;
      let supplyStoreUnits = 0;
      allSupplyMovements.forEach((m: any) => {
        const d = new Date(m.created_at);
        if (d < new Date(periodStart) || (periodEnd && d >= new Date(periodEnd))) return;
        const v = computeSupplyMovementValue(m);
        if (!v) return;
        supplyStoreRevenue += v.revenue;
        supplyStoreProfit += v.revenue - v.cost;
        supplyStoreUnits += v.units;
      });

      // Supply-store shipments inside the period, counted as sales (product-level)
      const periodSupplySales: Array<{ product_id: string; quantity: number; revenue: number }> = [];
      allSupplyMovements.forEach((m: any) => {
        const d = new Date(m.created_at);
        if (d < new Date(periodStart) || (periodEnd && d >= new Date(periodEnd))) return;
        const v = computeSupplyMovementValue(m);
        if (!v) return;
        periodSupplySales.push({ product_id: m.product_id, quantity: v.units, revenue: v.revenue });
      });
      periodSupplySalesRef.current = periodSupplySales;
      productInfoRef.current = productInfoMap;

      // Distinct SKUs shipped into supply stores inside the selected period
      const periodSkuSupply = new Set<string>();
      allSupplyMovements.forEach((m: any) => {
        const d = new Date(m.created_at);
        if (d < new Date(periodStart) || (periodEnd && d >= new Date(periodEnd))) return;
        periodSkuSupply.add(m.product_id);
      });

      // Calculate stats
      const orderRevenuePeriod = periodOrders.reduce((sum, order) => sum + (order.total || 0), 0);
      const orderRevenueAll = orders.reduce((sum, order) => sum + (order.total || 0), 0);
      let supplyRevenueAll = 0;
      allSupplyMovements.forEach((m: any) => {
        const v = computeSupplyMovementValue(m);
        if (v) supplyRevenueAll += v.revenue;
      });

      // Period order profit = order.total (net of discount, incl. tax) - COGS
      // Note: line_total is stored gross (pre-discount), so summing it inflates profit
      // whenever a discount is applied. Use order.total as the revenue base instead.
      const periodOrderIds = new Set(periodOrders.map((o: any) => o.id));
      periodOrderIdsRef.current = periodOrderIds;
      // Distinct SKUs that actually sold (orders) inside the selected period
      const periodSkuOrders = new Set<string>();
      (orderItemsRes.data || []).forEach((it: any) => {
        if (periodOrderIds.has(it.order_id)) periodSkuOrders.add(it.product_id);
      });
      const orderCogsMap = new Map<string, number>();
      (orderItemsRes.data || []).forEach((it: any) => {
        if (!periodOrderIds.has(it.order_id)) return;
        const pricing = productPricingMap.get(it.product_id);
        const cost = pricing ? pricing.cost : 0;
        const lineCost = cost * Number(it.quantity ?? 0);
        orderCogsMap.set(it.order_id, (orderCogsMap.get(it.order_id) ?? 0) + lineCost);
      });
      let orderProfitPeriod = 0;
      periodOrders.forEach((o: any) => {
        const netRevenue = Number(o.total ?? 0) - Number(o.tax ?? 0);
        const cogs = orderCogsMap.get(o.id) ?? 0;
        orderProfitPeriod += netRevenue - cogs;
      });

      // Website-only figures (orders placed through the customer app)
      const websitePeriodOrders = periodOrders.filter((o: any) => !o.salon_id && !o.created_by);
      const totalWebsiteOrders = orders.filter((o: any) => !o.salon_id && !o.created_by).length;
      const websiteRevenuePeriod = websitePeriodOrders.reduce(
        (s: number, o: any) => s + Number(o.total || 0), 0
      );
      let websiteProfitPeriod = 0;
      websitePeriodOrders.forEach((o: any) => {
        const netRevenue = Number(o.total ?? 0) - Number(o.tax ?? 0);
        const cogs = orderCogsMap.get(o.id) ?? 0;
        websiteProfitPeriod += netRevenue - cogs;
      });

      // Salon-only figures (orders tied to a salon client)
      const salonPeriodOrders = periodOrders.filter((o: any) => o.salon_id);
      const salonRevenuePeriod = salonPeriodOrders.reduce(
        (s: number, o: any) => s + Number(o.total || 0), 0
      );
      let salonProfitPeriod = 0;
      salonPeriodOrders.forEach((o: any) => {
        const netRevenue = Number(o.total ?? 0) - Number(o.tax ?? 0);
        const cogs = orderCogsMap.get(o.id) ?? 0;
        salonProfitPeriod += netRevenue - cogs;
      });


      // Website users = customer accounts registered on the website
      const customerProfiles = (profilesRes.data || []).filter((p: any) => (p.role ?? "Customer") === "Customer");
      const websiteUsers = customerProfiles.length;
      const newWebsiteUsers = customerProfiles.filter((p: any) => {
        if (!p.created_at) return false;
        const d = new Date(p.created_at);
        return d >= new Date(periodStart) && (!periodEnd || d < new Date(periodEnd));
      }).length;

      const newStats: Stats = {
        totalOrders: orders.length,
        monthlyOrders: periodOrders.length,
        periodWebsiteOrders: websitePeriodOrders.length,
        totalWebsiteOrders,
        totalSalons: salonsRes.data?.length || 0,
        activeSupplyStores: (supplyStoresRes.data || []).filter((s: any) => (s.status ?? "active") === "active").length,
        totalProducts: productsRes.data?.length || 0,
        periodSkus: new Set([...periodSkuOrders, ...periodSkuSupply]).size,
        periodSkusFromOrders: periodSkuOrders.size,
        periodSkusFromSupply: periodSkuSupply.size,
        monthlyRevenue: orderRevenuePeriod + supplyStoreRevenue,
        monthlyProfit: orderProfitPeriod + supplyStoreProfit,
        websiteRevenue: websiteRevenuePeriod,
        websiteProfit: websiteProfitPeriod,
        salonRevenue: salonRevenuePeriod,
        salonProfit: salonProfitPeriod,
        totalRevenue: orderRevenueAll + supplyRevenueAll,
        supplyStoreRevenue,
        supplyStoreProfit,
        supplyStoreUnits,
        websiteUsers,
        newWebsiteUsers,
      };
      setStats(newStats);

      // Calculate top salons — website orders stay as one "Website orders" group
      const websiteOrdersList: WebsiteOrderRow[] = [];
      const salonStats = orders.reduce((acc: Record<string, { count: number; revenue: number; name: string; salon_id: string | null; isWebsite?: boolean }>, order) => {
        const isWebsite = !order.salon_id && !order.created_by;
        const isInPerson = !order.salon_id && !!order.created_by;
        const groupKey = order.salon_id || (isWebsite ? 'website' : 'in-person');
        const salonName = order.salons?.name || (isInPerson ? "In-person" : isWebsite ? "Website orders" : "Unknown");
        if (!acc[groupKey]) {
          acc[groupKey] = { count: 0, revenue: 0, name: salonName, salon_id: order.salon_id || null, isWebsite };
        }
        acc[groupKey].count += 1;
        acc[groupKey].revenue += order.total || 0;
        if (isWebsite) {
          const customerKey = order.profile_id || (order as any).customer_email || (order as any).customer_name || 'unknown';
          websiteOrdersList.push({
            id: order.id,
            total: order.total || 0,
            created_at: order.created_at,
            status: order.status,
            customer_key: customerKey,
            customer_name: (order as any).customer_name || displayName(null, (order as any).customer_email),
            profile_id: (order as any).profile_id || null,
          });
        }
        return acc;
      }, {});
      setWebsiteOrders(websiteOrdersList);

      const allSalonsData = Object.entries(salonStats)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .map(([, s]) => ({
          salon_id: s.salon_id,
          salon_name: s.name,
          order_count: s.count,
          total_revenue: s.revenue,
          is_website: s.isWebsite,
        }));
      setAllSalons(allSalonsData);
      setTopSalons(allSalonsData.slice(0, 5));

      // ===== Top supply stores (by revenue in selected period) =====
      const storeNameMap = new Map<string, string>();
      (supplyStoresRes.data || []).forEach((s: any) => storeNameMap.set(s.id, s.name));
      const storeStats = new Map<string, { revenue: number; units: number; shipments: Set<string> }>();
      allSupplyMovements.forEach((m: any) => {
        const d = new Date(m.created_at);
        if (d < new Date(periodStart) || (periodEnd && d >= new Date(periodEnd))) return;
        const storeId = m.to_location_id ? storeLocMap.get(m.to_location_id) : null;
        if (!storeId) return;
        const v = computeSupplyMovementValue(m);
        if (!v) return;
        if (!storeStats.has(storeId)) {
          storeStats.set(storeId, { revenue: 0, units: 0, shipments: new Set() });
        }
        const s = storeStats.get(storeId)!;
        s.revenue += v.revenue;
        s.units += v.units;
        s.shipments.add(`${m.created_at.split("T")[0]}__${m.reason ?? ""}`);
      });
      const allSupplyStoresData: TopSupplyStore[] = Array.from(storeStats.entries())
        .map(([id, s]) => ({
          store_id: id,
          store_name: storeNameMap.get(id) ?? "Unknown store",
          shipment_count: s.shipments.size,
          units: s.units,
          revenue: s.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue);
      setAllSupplyStores(allSupplyStoresData);
      setTopSupplyStores(allSupplyStoresData.slice(0, 5));

      // Calculate top products
      const productStats = (orderItemsRes.data || []).filter((it: any) => periodOrderIds.has(it.order_id)).reduce((acc: Record<string, { id: string; quantity: number; revenue: number; name: string; sku: string; supplier_sku?: string; image_url?: string }>, item) => {
        const productId = item.product_id;
        const productName = item.products?.name || "Unknown";
        const productSku = item.products?.sku || "";
        const productSupplierSku = item.products?.supplier_sku || "";
        const productImage = productImagesMap[productId] || item.products?.image_url;
        if (!acc[productId]) {
          acc[productId] = { id: productId, quantity: 0, revenue: 0, name: productName, sku: productSku, supplier_sku: productSupplierSku, image_url: productImage };
        }
        acc[productId].quantity += item.quantity || 0;
        acc[productId].revenue += item.line_total || 0;
        return acc;
      }, {});

      periodSupplySales.forEach((row) => {
        const info = productInfoMap.get(row.product_id);
        if (!info) return;
        if (!productStats[row.product_id]) {
          productStats[row.product_id] = { id: row.product_id, quantity: 0, revenue: 0, name: info.name, sku: info.sku, supplier_sku: info.supplier_sku, image_url: productImagesMap[row.product_id] || info.image_url };
        }
        productStats[row.product_id].quantity += row.quantity;
        productStats[row.product_id].revenue += row.revenue;
      });

      const stockByProduct = new Map<string, number>((stockRes.data || []).map((p: any) => [p.id, p.stock_on_hand ?? 0]));
      const topProductsData = Object.values(productStats)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10)
        .map(p => ({
          product_id: p.id,
          product_name: p.name,
          sku: p.sku,
          quantity_sold: p.quantity,
          revenue: p.revenue,
          supplier_sku: p.supplier_sku,
          image_url: p.image_url,
          stock_left: stockByProduct.get(p.id) ?? 0,
        }));
      setTopProducts(topProductsData);

      // Calculate stock values
      const stockData = (stockRes.data || [])
        .filter(p => p.stock_on_hand > 0)
        .map(p => ({
          product_name: p.name,
          sku: p.sku || "",
          stock: p.stock_on_hand,
          price: p.price_usd,
          value: p.stock_on_hand * p.price_usd,
          // Use products.image_url first, fallback to product_images table
          image_url: productImagesMap[p.id] || p.image_url,
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
      const isCustom = timePeriod === "custom";
      const isSpecificMonth = timePeriod.includes("-") && !isCustom;
      let days: number;
      let trendStartDate: Date;
      
      if (isCustom) {
        const [sy, sm, sd] = customStart.split("-").map(Number);
        const [ey, em, ed] = customEnd.split("-").map(Number);
        trendStartDate = new Date(sy, sm - 1, sd);
        const endD = new Date(ey, em - 1, ed);
        days = Math.min(
          370,
          Math.max(1, Math.round((endD.getTime() - trendStartDate.getTime()) / 86400000) + 1)
        );
      } else if (isSpecificMonth) {
        const [year, month] = timePeriod.split("-").map(Number);
        trendStartDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0); // last day of month
        days = endDate.getDate();
      } else if (timePeriod === "month") {
        trendStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        // Days from 1st of month to today
        days = now.getDate();
      } else if (timePeriod === "week") {
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        trendStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
        // Days from Monday to today
        days = diffToMonday + 1;
      } else {
        days = 1;
        trendStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
      
      const trendData: RevenueData[] = [];
      
      for (let i = 0; i < days; i++) {
        const date = new Date(trendStartDate);
        date.setDate(trendStartDate.getDate() + i);
        const dateStr = date.toLocaleDateString('en-CA'); // YYYY-MM-DD local
        
        const dayOrders = orders.filter(o => {
          return toLocalDateStr(o.created_at) === dateStr;
        });
        
        const dayRevenue = dayOrders.reduce((sum, order) => sum + (order.total || 0), 0);
        
        trendData.push({
          date: isSpecificMonth || isCustom || timePeriod === "month" ? formatLocalDate(date, { month: 'short', day: 'numeric' }) : formatLocalDate(date, { weekday: 'short' }),
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

      const categoryStats = (orderItemsRes.data || []).filter((it: any) => periodOrderIds.has(it.order_id)).reduce((acc: Record<string, number>, item) => {
        const category = item.products?.category || "Other";
        acc[category] = (acc[category] || 0) + (item.line_total || 0);
        return acc;
      }, {});

      periodSupplySales.forEach((row) => {
        const info = productInfoMap.get(row.product_id);
        const category = info?.category || "Other";
        categoryStats[category] = (categoryStats[category] || 0) + row.revenue;
      });

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
      const dayStats = periodOrders.reduce((acc: Record<number, { revenue: number; orders: number }>, order) => {
        const dayNum = getLocalDay(order.created_at);
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
          const date = new Date(trendStartDate);
          date.setDate(trendStartDate.getDate() + idx);
          const dateStr = date.toLocaleDateString('en-CA');
          return toLocalDateStr(o.created_at) === dateStr;
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
      for (let i = 0; i < days; i++) {
        const date = new Date(trendStartDate);
        date.setDate(trendStartDate.getDate() + i);
        const dateStr = date.toLocaleDateString('en-CA');
        
        let dayRevenue = 0;
        let dayCost = 0;
        
        orders.filter(o => toLocalDateStr(o.created_at) === dateStr)
          .forEach(order => {
            dayRevenue += order.total || 0;
          });
        
        // Estimate cost as 60% of revenue (simplified)
        dayCost = dayRevenue * 0.6;
        const dayProfit = dayRevenue - dayCost;
        const margin = dayRevenue > 0 ? (dayProfit / dayRevenue) * 100 : 0;
        
        profitTrend.push({
          date: isSpecificMonth || isCustom || timePeriod === "month" ? formatLocalDate(date, { month: 'short', day: 'numeric' }) : formatLocalDate(date, { weekday: 'short' }),
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
          .select("product_id, order_id, quantity, line_total, products(id, name, sku, category, image_url)")
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
        if (!periodOrderIdsRef.current.has(item.order_id)) return;
        
        const productId = item.product_id;
        if (!productMap[productId]) {
          productMap[productId] = {
            id: productId,
            name: item.products.name,
            quantity: 0,
            revenue: 0,
            // Use products.image_url first, fallback to product_images table
            image_url: productImagesMap[productId] || item.products.image_url,
            sku: item.products.sku || "",
          };
        }
        productMap[productId].quantity += item.quantity || 0;
        productMap[productId].revenue += item.line_total || 0;
      });
      
      periodSupplySalesRef.current.forEach((row) => {
        const info = productInfoRef.current.get(row.product_id);
        if (!info || info.category !== category) return;
        if (!productMap[row.product_id]) {
          productMap[row.product_id] = {
            id: row.product_id,
            name: info.name,
            quantity: 0,
            revenue: 0,
            image_url: productImagesMap[row.product_id] || info.image_url,
            sku: info.sku || "",
          };
        }
        productMap[row.product_id].quantity += row.quantity;
        productMap[row.product_id].revenue += row.revenue;
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

  const periodLabel = timePeriod === "day" ? "Today's" : timePeriod === "week" ? "Weekly" : timePeriod === "month" ? "Monthly" : timePeriod === "custom" ? (customStart && customEnd ? `${customStart} → ${customEnd}` : "Custom range") : (() => {
    const [y, m] = timePeriod.split("-").map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  })();

  const exportDashboardData = () => {
    const exportData = [
      { metric: 'Total Orders', value: stats.totalOrders },
      { metric: 'Period Orders', value: stats.monthlyOrders },
      { metric: `${periodLabel} Website Orders`, value: stats.periodWebsiteOrders },
      { metric: 'Total Website Orders', value: stats.totalWebsiteOrders },
      { metric: 'Active Salons', value: stats.totalSalons },
      { metric: 'Products', value: stats.totalProducts },
      { metric: `${periodLabel} SKUs Sold`, value: stats.periodSkus },
      { metric: 'Period Revenue', value: `$${stats.monthlyRevenue.toFixed(2)}` },
      { metric: 'Total Revenue', value: `$${stats.totalRevenue.toFixed(2)}` },
      { metric: 'Total Stock Value', value: `$${totalStockValue.toFixed(2)}` },
    ];
    downloadCSV(exportData, 'dashboard-overview');
    toast({ title: "Success", description: "Dashboard data exported successfully" });
  };
  
  const statsCards: Array<{
    title: string;
    value: string;
    icon: any;
    description: string;
    onClick?: () => void;
    highlight?: boolean;
    tone?: "emerald" | "purple";
  }> = [
    {
      // 0 = All orders, 1 = Website orders (placed through the customer app)
      title: orderCardView === 0 ? `${periodLabel} Orders` : `${periodLabel} Website Orders`,
      value: loading
        ? "..."
        : orderCardView === 0
          ? stats.monthlyOrders.toString()
          : stats.periodWebsiteOrders.toString(),
      icon: orderCardView === 0 ? TrendingUp : Globe,
      description:
        orderCardView === 0
          ? `${stats.totalOrders} total orders · tap for website orders`
          : `${stats.totalWebsiteOrders} total website orders`,
      onClick: () => setOrderCardView((v) => (v + 1) % 2),
      highlight: orderCardView !== 0,
      tone: "purple" as const,
    },
    {
      // 0 = Salon count, 1 = Salon Revenue, 2 = Salon Clean Profit, 3 = Supply Stores
      title:
        salonCardView === 0
          ? "Active Salons"
          : salonCardView === 1
            ? `${periodLabel} Salon Revenue`
            : salonCardView === 2
              ? `${periodLabel} Salon Clean Profit`
              : salonCardView === 3
                ? "Active Supply Stores"
                : salonCardView === 4
                  ? `${periodLabel} Supply Revenue`
                  : `${periodLabel} Supply Clean Profit`,
      value: loading
        ? "..."
        : salonCardView === 0
          ? stats.totalSalons.toString()
          : salonCardView === 1
            ? `$${stats.salonRevenue.toFixed(2)}`
            : salonCardView === 2
              ? `$${stats.salonProfit.toFixed(2)}`
              : salonCardView === 3
                ? stats.activeSupplyStores.toString()
                : salonCardView === 4
                  ? `$${stats.supplyStoreRevenue.toFixed(2)}`
                  : `$${stats.supplyStoreProfit.toFixed(2)}`,
      icon: Users,
      description:
        salonCardView === 0
          ? "Total clients · tap for salon revenue"
          : salonCardView === 1
            ? stats.salonRevenue > 0
              ? "From salon orders · tap for clean profit"
              : "No salon orders · tap for clean profit"
            : salonCardView === 2
              ? stats.salonRevenue > 0
                ? `${((stats.salonProfit / stats.salonRevenue) * 100).toFixed(1)}% margin · tap for supply stores`
                : "Tap for supply stores"
              : salonCardView === 3
                ? "Tap for supply revenue"
                : salonCardView === 4
                  ? "From supply stores · tap for clean profit"
                  : stats.supplyStoreRevenue > 0
                    ? `${((stats.supplyStoreProfit / stats.supplyStoreRevenue) * 100).toFixed(1)}% margin · tap to see salons`
                    : "Tap to see salons",
      onClick: () => setSalonCardView((v) => (v + 1) % 6),
      highlight: salonCardView !== 0 && salonCardView !== 3,
      tone: "emerald" as const,
    },
    {
      title: productCardView === 0 ? "Products" : `${periodLabel} SKUs Sold`,
      value: loading
        ? "..."
        : productCardView === 0
          ? stats.totalProducts.toString()
          : stats.periodSkus.toString(),
      icon: Package,
      description:
        productCardView === 0
          ? "In catalog · tap for SKUs sold in period"
          : `${stats.periodSkusFromOrders} from orders · ${stats.periodSkusFromSupply} from supply stores`,
      onClick: () => setProductCardView((v) => (v + 1) % 2),
      highlight: productCardView !== 0,
      tone: "emerald" as const,
    },
    {
      title:
        revenueView === 0
          ? `${periodLabel} Revenue`
          : revenueView === 1
            ? `${periodLabel} Clean Profit`
            : revenueView === 2
              ? `${periodLabel} Website Revenue`
              : `${periodLabel} Website Clean Profit`,
      value: loading
        ? "..."
        : revenueView === 0
          ? `$${stats.monthlyRevenue.toFixed(2)}`
          : revenueView === 1
            ? `$${stats.monthlyProfit.toFixed(2)}`
            : revenueView === 2
              ? `$${stats.websiteRevenue.toFixed(2)}`
              : `$${stats.websiteProfit.toFixed(2)}`,
      icon: DollarSign,
      description:
        revenueView === 0
          ? stats.supplyStoreRevenue > 0
            ? `Incl. $${stats.supplyStoreRevenue.toFixed(2)} from supply stores · tap for profit`
            : `$${stats.totalRevenue.toFixed(2)} total · tap for profit`
          : revenueView === 1
            ? stats.monthlyRevenue > 0
              ? `${((stats.monthlyProfit / stats.monthlyRevenue) * 100).toFixed(1)}% margin · tap for website revenue`
              : "Tap for website revenue"
            : revenueView === 2
              ? "From the customer app · tap for website profit"
              : stats.websiteRevenue > 0
                ? `${((stats.websiteProfit / stats.websiteRevenue) * 100).toFixed(1)}% margin · tap to see revenue`
                : "Tap to see revenue",
      onClick: () => setRevenueView((v) => (v + 1) % 4),
      highlight: revenueView !== 0,
      tone: revenueView >= 2 ? "purple" : "emerald",
    },
  ];

  // Extra row of supply-store-specific KPIs (only when there's activity)
  const supplyStoreCards: Array<{
    title: string;
    value: string;
    icon: any;
    description: string;
    onClick?: () => void;
    highlight?: boolean;
  }> = stats.supplyStoreRevenue > 0 ? [
    {
      title: showSupplyAsProfit
        ? `${periodLabel} Supply Store Profit`
        : `${periodLabel} Supply Store Sales`,
      value: showSupplyAsProfit
        ? `$${stats.supplyStoreProfit.toFixed(2)}`
        : `$${stats.supplyStoreRevenue.toFixed(2)}`,
      icon: TrendingUp,
      description: showSupplyAsProfit
        ? stats.supplyStoreRevenue > 0
          ? `${((stats.supplyStoreProfit / stats.supplyStoreRevenue) * 100).toFixed(1)}% margin · tap to see sales`
          : "Tap to see sales"
        : `${stats.supplyStoreUnits} units shipped · tap for profit`,
      onClick: () => setShowSupplyAsProfit((v) => !v),
      highlight: showSupplyAsProfit,
    },
  ] : [];

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
              <SelectItem value="custom">Custom range…</SelectItem>
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
          {timePeriod === "custom" && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
                className="min-h-[44px] w-full sm:w-[150px]"
              />
              <span className="text-muted-foreground text-sm">→</span>
              <Input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="min-h-[44px] w-full sm:w-[150px]"
              />
            </div>
          )}
          <Button onClick={exportDashboardData} variant="outline" size="default" className="min-h-[44px] flex-1 sm:flex-none">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>


      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => (
          <Card
            key={index}
            onClick={stat.onClick}
            className={`shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-all ${
              stat.onClick ? "cursor-pointer" : ""
            } ${
              stat.highlight
                ? stat.tone === "purple"
                  ? "border-purple-500/60 bg-purple-500/5"
                  : "border-emerald-500/60 bg-emerald-500/5"
                : ""
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon
                className={`h-4 w-4 flex-shrink-0 ${
                  stat.highlight
                    ? stat.tone === "purple"
                      ? "text-purple-500"
                      : "text-emerald-500"
                    : "text-primary"
                }`}
              />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div
                className={`text-lg sm:text-2xl font-bold truncate ${
                  stat.highlight
                    ? stat.tone === "purple"
                      ? "text-purple-500"
                      : "text-emerald-500"
                    : ""
                }`}
              >
                {stat.value}
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {supplyStoreCards.length > 0 && (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
          {supplyStoreCards.map((stat, index) => (
            <Card
              key={index}
              onClick={stat.onClick}
              className={`shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-all border-primary/20 ${
                stat.onClick ? "cursor-pointer" : ""
              } ${stat.highlight ? "border-emerald-500/60 bg-emerald-500/5" : ""}`}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon
                  className={`h-4 w-4 flex-shrink-0 ${stat.highlight ? "text-emerald-500" : "text-primary"}`}
                />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div
                  className={`text-lg sm:text-2xl font-bold truncate ${stat.highlight ? "text-emerald-500" : ""}`}
                >
                  {stat.value}
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
              ctx.fillText(`${periodLabel} · Generated ${new Date().toLocaleDateString()}`, 40, 70);
              
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
            <p className="text-xs text-muted-foreground">{periodLabel} only</p>
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
                    className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => openProductFromDashboard({ sku: product.sku, name: product.name }, true)}
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
                      {product.sku && (
                        <p className="text-xs text-muted-foreground/70 font-mono truncate">{product.sku}</p>
                      )}
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

      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base sm:text-lg truncate">Top Salons</CardTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const csvHeader = "Salon,Orders,Revenue\n";
                  const csvRows = (allSalons.length > 0 ? allSalons : topSalons)
                    .map((s) => `"${(s.salon_name || "").replace(/"/g, '""')}",${s.order_count},${s.total_revenue.toFixed(2)}`)
                    .join("\n");
                  const blob = new Blob([csvHeader + csvRows], { type: "text/csv" });
                  const link = document.createElement("a");
                  link.download = `top-salons-${new Date().toISOString().split("T")[0]}.csv`;
                  link.href = URL.createObjectURL(blob);
                  link.click();
                  URL.revokeObjectURL(link.href);
                  toast({ title: "Success", description: "Top salons exported as CSV" });
                }}
                disabled={topSalons.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                CSV
              </Button>
              {allSalons.length > 5 && (
                <Button variant="ghost" size="sm" onClick={() => setShowAllSalons(true)} className="text-xs text-primary">
                  View All ({allSalons.length})
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
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
                {topSalons.map((salon, index) => {
                  const clickable = !!salon.salon_id || !!salon.is_website;
                  return (
                    <div
                      key={index}
                      className={`flex items-center justify-between border-b pb-2 last:border-0 ${clickable ? 'cursor-pointer hover:bg-muted/50 rounded-lg px-2 py-1 -mx-2 transition-colors' : ''} ${salon.is_website ? 'bg-purple-500/10 rounded-lg px-2 py-1 -mx-2' : ''}`}
                      onClick={() => handleSalonEntryClick(salon)}
                    >
                      <div>
                        <p className={`font-medium ${salon.is_website ? 'text-purple-500' : ''}`}>
                          {salon.salon_name}
                          {salon.is_website && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-purple-500/80">Website</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">{salon.order_count} orders</p>
                      </div>
                      <p className={`font-semibold ${salon.is_website ? 'text-purple-500' : 'text-primary'}`}>${salon.total_revenue.toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-col gap-2 items-stretch">
            <button
              type="button"
              onClick={() => setTopSupplyStoresOpen((v) => !v)}
              className="flex items-center gap-2 text-left w-full"
            >
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${topSupplyStoresOpen ? "" : "-rotate-90"}`} />
              <CardTitle className="text-base sm:text-lg">Top Supply Stores</CardTitle>
              {!topSupplyStoresOpen && topSupplyStores.length > 0 && (
                <span className="text-xs text-muted-foreground ml-1">({topSupplyStores.length})</span>
              )}
            </button>
            {topSupplyStoresOpen && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const rows = (allSupplyStores.length > 0 ? allSupplyStores : topSupplyStores);
                    const csvHeader = "Supply Store,Shipments,Units,Revenue\n";
                    const csvRows = rows
                      .map((s) => `"${(s.store_name || "").replace(/"/g, '""')}",${s.shipment_count},${s.units},${s.revenue.toFixed(2)}`)
                      .join("\n");
                    const blob = new Blob([csvHeader + csvRows], { type: "text/csv" });
                    const link = document.createElement("a");
                    link.download = `top-supply-stores-${new Date().toISOString().split("T")[0]}.csv`;
                    link.href = URL.createObjectURL(blob);
                    link.click();
                    URL.revokeObjectURL(link.href);
                    toast({ title: "Success", description: "Top supply stores exported as CSV" });
                  }}
                  disabled={topSupplyStores.length === 0}
                >
                  <Download className="h-4 w-4 mr-1" />
                  CSV
                </Button>
                {allSupplyStores.length > 5 && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAllSupplyStores(true)} className="text-xs text-primary">
                    View All ({allSupplyStores.length})
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          {topSupplyStoresOpen && (
          <CardContent className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : topSupplyStores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No stock has been sent to supply stores in this period.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {topSupplyStores.map((store) => (
                  <div
                    key={store.store_id}
                    className="flex items-center justify-between border-b pb-2 last:border-0 cursor-pointer hover:bg-muted/50 rounded-lg px-2 py-1 -mx-2 transition-colors"
                    onClick={() => {
                      setSelectedStoreId(store.store_id);
                      setSelectedStoreName(store.store_name);
                    }}
                  >
                    <div>
                      <p className="font-medium">{store.store_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {store.shipment_count} {store.shipment_count === 1 ? "shipment" : "shipments"} · {store.units} units
                      </p>
                    </div>
                    <p className="font-semibold text-primary">${store.revenue.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          )}
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-col gap-2 items-stretch">
            <button
              type="button"
              onClick={() => setTopProductsOpen((v) => !v)}
              className="flex items-center gap-2 text-left w-full"
            >
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${topProductsOpen ? "" : "-rotate-90"}`} />
              <CardTitle className="text-base sm:text-lg">Top Products</CardTitle>
              {!topProductsOpen && topProducts.length > 0 && (
                <span className="text-xs text-muted-foreground ml-1">({topProducts.length})</span>
              )}
            </button>
            {topProductsOpen && (
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  const csvHeader = "SKU,Supplier SKU,Product Name,Units Sold,Revenue\n";
                  const csvRows = topProducts.map(p => 
                    `"${p.sku}","${p.supplier_sku || ''}","${p.product_name}",${p.quantity_sold},${p.revenue.toFixed(2)}`
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
            )}
          </CardHeader>
          {topProductsOpen && (
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
                    className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 cursor-pointer hover:bg-muted/50 rounded-lg px-2 py-1 -mx-2 transition-colors"
                    onClick={() => openProductFromDashboard({ sku: product.sku, name: product.product_name }, false)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.product_name}
                          className="h-12 w-12 rounded-lg object-cover border bg-muted shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg border bg-muted flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{product.product_name}</p>
                        <div className="flex items-center gap-2">
                          {product.sku && (
                            <span className="text-xs text-muted-foreground/60 font-mono">{product.sku}</span>
                          )}
                          <span className="text-sm text-muted-foreground">{product.quantity_sold} sold</span>
                          <span className={`text-sm ${(product as any).stock_left <= 0 ? "text-destructive" : "text-muted-foreground"}`}>· {(product as any).stock_left ?? 0} left</span>
                        </div>
                      </div>
                    </div>
                    <p className="font-semibold text-primary shrink-0">${product.revenue.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          )}
        </Card>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <button
            type="button"
            onClick={() => setStockValueOpen((v) => !v)}
            className="flex items-start gap-2 text-left flex-1 min-w-0"
          >
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 mt-1 ${stockValueOpen ? "" : "-rotate-90"}`} />
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">Stock Inventory Value</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Total: ${loading ? "..." : totalStockValue.toFixed(2)}</p>
            </div>
          </button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={async () => {
              try {
                const { downloadCSV } = await import("@/lib/csv-export");
                const rows = stockValues.map((item) => ({
                  Product: item.product_name,
                  SKU: item.sku || "",
                  Stock: item.stock,
                  "Price ($)": item.price.toFixed(2),
                  "Value ($)": item.value.toFixed(2),
                }));
                rows.push({ Product: "TOTAL", SKU: "", Stock: stockValues.reduce((s, i) => s + i.stock, 0), "Price ($)": "", "Value ($)": totalStockValue.toFixed(2) });
                downloadCSV(rows, "stock-inventory");
                toast({ title: "Exported", description: `Stock inventory exported (${stockValues.length} products)` });
              } catch (e: any) {
                toast({ title: "Export failed", description: e?.message ?? "Please try again", variant: "destructive" });
              }
            }}
            disabled={stockValues.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
        </CardHeader>
        {stockValueOpen && (
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
                    <div className="flex items-center gap-2">
                      {item.sku && (
                        <span className="text-xs text-muted-foreground/60 font-mono">{item.sku}</span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {item.stock} pieces × ${item.price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <p className="font-semibold text-primary">${item.value.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
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

      <Dialog open={websiteCustomersOpen} onOpenChange={(open) => { setWebsiteCustomersOpen(open); if (!open) setSelectedWebsiteCustomer(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedWebsiteCustomer ? `${selectedWebsiteCustomer.name} — Orders` : "Website Orders"}
            </DialogTitle>
          </DialogHeader>
          {selectedWebsiteCustomer && (
            <Button variant="ghost" size="sm" className="self-start -mt-2 text-purple-500" onClick={() => setSelectedWebsiteCustomer(null)}>
              ← Back to customers
            </Button>
          )}
          <ScrollArea className="max-h-[60vh]">
            {!selectedWebsiteCustomer ? (
              <div className="space-y-2 pr-2">
                {websiteCustomers.map((c) => (
                  <div
                    key={c.key}
                    className="flex items-center justify-between rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 cursor-pointer hover:bg-purple-500/10 transition-colors"
                    onClick={() => {
                      if (c.profile_id) {
                        setWebsiteCustomersOpen(false);
                        navigate(`/users?userId=${c.profile_id}`);
                      } else {
                        setSelectedWebsiteCustomer({ key: c.key, name: c.name, profile_id: c.profile_id });
                      }
                    }}
                  >
                    <div>
                      <p className="font-medium text-sm text-purple-500">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.count} {c.count === 1 ? "order" : "orders"}</p>
                    </div>
                    <p className="font-semibold text-purple-500">${c.revenue.toFixed(2)}</p>
                  </div>
                ))}
                {websiteCustomers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No website orders yet.</p>
                )}
              </div>
            ) : (
              <div className="space-y-2 pr-2">
                {websiteOrders
                  .filter((o) => o.customer_key === selectedWebsiteCustomer.key)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((o) => (
                    <div key={o.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium text-sm">#{o.id.slice(0, 8).toUpperCase()}</p>
                        <p className="text-xs text-muted-foreground">{formatLocalDate(new Date(o.created_at), { month: "short", day: "numeric", year: "numeric" })} · {o.status}</p>
                      </div>
                      <p className="font-semibold text-purple-500">${o.total.toFixed(2)}</p>
                    </div>
                  ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Sheet open={showAllSalons} onOpenChange={setShowAllSalons}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>All Salons Ranking</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
            <div className="space-y-2 pr-4">
              {allSalons.map((salon, index) => {
                const clickable = !!salon.salon_id || !!salon.is_website;
                return (
                  <div
                    key={index}
                    className={`flex items-center justify-between border-b pb-2 last:border-0 rounded-lg px-3 py-2 transition-colors ${clickable ? 'cursor-pointer hover:bg-muted/50' : ''} ${salon.is_website ? 'bg-purple-500/10' : ''}`}
                    onClick={() => {
                      if (!clickable) return;
                      setShowAllSalons(false);
                      handleSalonEntryClick(salon);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-muted-foreground w-6 text-right">#{index + 1}</span>
                      <div>
                        <p className={`font-medium ${salon.is_website ? 'text-purple-500' : ''}`}>
                          {salon.salon_name}
                          {salon.is_website && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-purple-500/80">Website</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">{salon.order_count} orders</p>
                      </div>
                    </div>
                    <p className={`font-semibold ${salon.is_website ? 'text-purple-500' : 'text-primary'}`}>${salon.total_revenue.toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <SupplyStoreStockHistory
        storeId={selectedStoreId}
        storeName={selectedStoreName}
        open={!!selectedStoreId}
        onOpenChange={(open) => { if (!open) setSelectedStoreId(null); }}
      />

      <Sheet open={showAllSupplyStores} onOpenChange={setShowAllSupplyStores}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>All Supply Stores Ranking</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
            <div className="space-y-2 pr-4">
              {allSupplyStores.map((store, index) => (
                <div
                  key={store.store_id}
                  className="flex items-center justify-between border-b pb-2 last:border-0 rounded-lg px-3 py-2 transition-colors cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    setShowAllSupplyStores(false);
                    setSelectedStoreId(store.store_id);
                    setSelectedStoreName(store.store_name);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6 text-right">#{index + 1}</span>
                    <div>
                      <p className="font-medium">{store.store_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {store.shipment_count} {store.shipment_count === 1 ? "shipment" : "shipments"} · {store.units} units
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold text-primary">${store.revenue.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Index;
