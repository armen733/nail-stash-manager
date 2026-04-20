// Warehouse CSV export helpers
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV } from "@/lib/csv-export";

type ExportType = "stock" | "sales" | "movements" | "low-stock";

interface ExportOptions {
  type: ExportType;
  /** When set, scope to a single location. Otherwise export across all locations. */
  locationId?: string;
  /** Pretty name for the file */
  scopeName?: string;
}

const todaySuffix = () => "";

export async function exportWarehouseReport({ type, locationId, scopeName }: ExportOptions) {
  const scope = scopeName ? scopeName.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "all-locations";

  if (type === "stock") {
    const query = supabase
      .from("product_stock")
      .select(
        "quantity, reserved, location:stock_locations(name, type), product:products(name, sku, cost_usd, price_usd, reorder_level)"
      )
      .gt("quantity", 0)
      .order("quantity", { ascending: false });
    if (locationId) query.eq("location_id", locationId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []).map((r: any) => {
      const cost = r.product?.cost_usd && Number(r.product.cost_usd) > 0
        ? Number(r.product.cost_usd)
        : Number(r.product?.price_usd ?? 0);
      const retail = Number(r.product?.price_usd ?? 0);
      return {
        location: r.location?.name ?? "",
        location_type: r.location?.type ?? "",
        sku: r.product?.sku ?? "",
        product: r.product?.name ?? "",
        quantity: r.quantity,
        reserved: r.reserved,
        unit_cost: cost.toFixed(2),
        unit_retail: retail.toFixed(2),
        total_cost_value: (Number(r.quantity) * cost).toFixed(2),
        total_retail_value: (Number(r.quantity) * retail).toFixed(2),
        reorder_level: r.product?.reorder_level ?? "",
      };
    });
    if (rows.length === 0) throw new Error("No stock to export");
    downloadCSV(rows, `stock-by-location-${scope}${todaySuffix()}`);
    return rows.length;
  }

  if (type === "sales") {
    const query = supabase
      .from("stock_movements")
      .select(
        "created_at, quantity, unit_cost, reason, from_location_id, location:stock_locations!stock_movements_from_location_id_fkey(name, type), product:products(name, sku), creator:profiles!stock_movements_created_by_fkey(full_name)"
      )
      .eq("movement_type", "sale")
      .order("created_at", { ascending: false });
    if (locationId) query.eq("from_location_id", locationId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []).map((r: any) => ({
      date: new Date(r.created_at).toISOString().split("T")[0],
      time: new Date(r.created_at).toISOString().split("T")[1].slice(0, 5),
      location: r.location?.name ?? "",
      sku: r.product?.sku ?? "",
      product: r.product?.name ?? "",
      quantity: r.quantity,
      unit_price: r.unit_cost ? Number(r.unit_cost).toFixed(2) : "",
      revenue: r.unit_cost ? (Number(r.quantity) * Number(r.unit_cost)).toFixed(2) : "",
      sold_by: r.creator?.full_name ?? "",
      note: r.reason ?? "",
    }));
    if (rows.length === 0) throw new Error("No sales recorded yet");
    downloadCSV(rows, `sales-by-location-${scope}${todaySuffix()}`);
    return rows.length;
  }

  if (type === "movements") {
    const query = supabase
      .from("stock_movements")
      .select(
        "created_at, movement_type, quantity, unit_cost, reason, from:stock_locations!stock_movements_from_location_id_fkey(name), to:stock_locations!stock_movements_to_location_id_fkey(name), product:products(name, sku), creator:profiles!stock_movements_created_by_fkey(full_name)"
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (locationId) query.or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []).map((r: any) => ({
      date: new Date(r.created_at).toISOString().split("T")[0],
      time: new Date(r.created_at).toISOString().split("T")[1].slice(0, 5),
      type: r.movement_type,
      sku: r.product?.sku ?? "",
      product: r.product?.name ?? "",
      quantity: r.quantity,
      from: r.from?.name ?? "",
      to: r.to?.name ?? "",
      unit_cost: r.unit_cost ? Number(r.unit_cost).toFixed(2) : "",
      user: r.creator?.full_name ?? "",
      note: r.reason ?? "",
    }));
    if (rows.length === 0) throw new Error("No movements to export");
    downloadCSV(rows, `stock-movements-${scope}${todaySuffix()}`);
    return rows.length;
  }

  if (type === "low-stock") {
    const query = supabase
      .from("product_stock")
      .select(
        "quantity, location:stock_locations(name, type), product:products(name, sku, reorder_level)"
      )
      .gt("quantity", 0);
    if (locationId) query.eq("location_id", locationId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? [])
      .filter((r: any) => {
        const reorder = Number(r.product?.reorder_level ?? 0);
        return reorder > 0 && Number(r.quantity) <= reorder;
      })
      .map((r: any) => ({
        location: r.location?.name ?? "",
        location_type: r.location?.type ?? "",
        sku: r.product?.sku ?? "",
        product: r.product?.name ?? "",
        quantity: r.quantity,
        reorder_level: r.product?.reorder_level ?? "",
        shortage: Number(r.product?.reorder_level ?? 0) - Number(r.quantity),
      }))
      .sort((a, b) => b.shortage - a.shortage);
    if (rows.length === 0) throw new Error("No low-stock items");
    downloadCSV(rows, `low-stock-${scope}${todaySuffix()}`);
    return rows.length;
  }

  return 0;
}

export const EXPORT_LABELS: Record<ExportType, string> = {
  stock: "Stock by location",
  sales: "Sales by location",
  movements: "Stock movements log",
  "low-stock": "Low-stock report",
};
