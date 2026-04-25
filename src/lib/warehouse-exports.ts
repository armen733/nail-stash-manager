// Warehouse CSV export helpers
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV } from "@/lib/csv-export";

type ExportType = "stock" | "sales" | "movements" | "low-stock";

export interface ExportOptions {
  type: ExportType;
  /** When set, scope to a single location. Otherwise export across all locations. */
  locationId?: string;
  /** Pretty name for the file */
  scopeName?: string;
  /** Inclusive ISO date string (YYYY-MM-DD) for the start of the date range */
  startDate?: string;
  /** Inclusive ISO date string (YYYY-MM-DD) for the end of the date range */
  endDate?: string;
}

const dateSuffix = (startDate?: string, endDate?: string) => {
  if (!startDate && !endDate) return "";
  if (startDate && endDate) return `-${startDate}_to_${endDate}`;
  return `-${startDate ?? endDate}`;
};

export async function exportWarehouseReport({ type, locationId, scopeName, startDate, endDate }: ExportOptions) {
  const scope = scopeName ? scopeName.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "all-locations";

  // Stock & low-stock are point-in-time (current snapshot) — date range doesn't apply.
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
    downloadCSV(rows, `stock-by-location-${scope}`);
    return rows.length;
  }

  // Helpers to convert YYYY-MM-DD to inclusive timestamp range
  const startISO = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : null;
  // end is exclusive: add 1 day
  const endISO = endDate ? new Date(new Date(`${endDate}T00:00:00`).getTime() + 86400000).toISOString() : null;

  if (type === "sales") {
    // "Sales" = stock leaving a location: movement_type 'sale' (sold to end customer) and 'transfer'
    // (e.g., goods shipped to a supply store) are both relevant. We include both so a Main Warehouse
    // export shows what left, and a supply-store export shows what we shipped to them.
    // Need supply store info to compute per-store discounted price.
    const [movementsRes, supplyStoresRes, supplyLocsRes, overridesRes] = await Promise.all([
      (() => {
        const q = supabase
          .from("stock_movements")
          .select(
            "created_at, quantity, unit_cost, reason, movement_type, from_location_id, to_location_id, product_id, from_loc:stock_locations!stock_movements_from_location_id_fkey(name, type, supply_store_id), to_loc:stock_locations!stock_movements_to_location_id_fkey(name, type, supply_store_id), product:products(name, sku, cost_usd, wholesale_price_usd, price_usd), creator:profiles!stock_movements_created_by_fkey(full_name)"
          )
          .in("movement_type", ["sale", "transfer"])
          .order("created_at", { ascending: false });
        if (locationId) {
          q.or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`);
        }
        if (startISO) q.gte("created_at", startISO);
        if (endISO) q.lt("created_at", endISO);
        return q;
      })(),
      supabase.from("supply_stores").select("id, name, default_discount_percent"),
      supabase.from("stock_locations").select("id, supply_store_id").not("supply_store_id", "is", null),
      supabase.from("supply_store_products").select("supply_store_id, product_id, discount_percent_override"),
    ]);
    if (movementsRes.error) throw movementsRes.error;

    const storeById = new Map<string, { name: string; discount: number }>();
    (supplyStoresRes.data ?? []).forEach((s: any) =>
      storeById.set(s.id, { name: s.name, discount: Number(s.default_discount_percent) || 0 }),
    );
    const overrideMap = new Map<string, number>();
    (overridesRes.data ?? []).forEach((o: any) => {
      if (o.discount_percent_override != null) {
        overrideMap.set(`${o.supply_store_id}:${o.product_id}`, Number(o.discount_percent_override));
      }
    });

    const rows = (movementsRes.data ?? [])
      // For 'transfer', only count those leaving toward an outside location (supply store).
      // Skip pure internal warehouse-to-warehouse moves to avoid double-counting.
      .filter((r: any) => {
        if (r.movement_type === "sale") return true;
        // transfer
        const toIsSupply = !!r.to_loc?.supply_store_id;
        const fromIsSupply = !!r.from_loc?.supply_store_id;
        // export only when one side is a supply store (these are the "wholesale" sales)
        return toIsSupply || fromIsSupply;
      })
      .map((r: any) => {
        const isTransferToStore = r.movement_type === "transfer" && !!r.to_loc?.supply_store_id;
        const storeId = isTransferToStore ? r.to_loc.supply_store_id : r.from_loc?.supply_store_id ?? null;
        const store = storeId ? storeById.get(storeId) : null;
        const wholesale = Number(r.product?.wholesale_price_usd ?? r.product?.price_usd ?? 0);
        const cost = Number(r.product?.cost_usd ?? 0);
        const productId = (r as any).product_id;
        // unit revenue:
        // - 'sale' => unit_cost (we record the actual sale price there)
        // - 'transfer' to supply store => discounted wholesale price (per-product override or store default)
        let unitRevenue = 0;
        let discountPct = 0;
        if (r.movement_type === "sale") {
          unitRevenue = r.unit_cost ? Number(r.unit_cost) : Number(r.product?.price_usd ?? 0);
        } else if (isTransferToStore && storeId) {
          const overrideKey = `${storeId}:${productId}`;
          discountPct = overrideMap.has(overrideKey) ? overrideMap.get(overrideKey)! : (store?.discount ?? 0);
          unitRevenue = wholesale * (1 - discountPct / 100);
        }
        const revenue = unitRevenue * Number(r.quantity);
        const totalCost = cost * Number(r.quantity);
        return {
          date: new Date(r.created_at).toISOString().split("T")[0],
          time: new Date(r.created_at).toISOString().split("T")[1].slice(0, 5),
          channel: r.movement_type === "sale" ? "Direct sale" : (isTransferToStore ? `Supply store: ${store?.name ?? "Unknown"}` : "Transfer"),
          from_location: r.from_loc?.name ?? "",
          to_location: r.to_loc?.name ?? "",
          sku: r.product?.sku ?? "",
          product: r.product?.name ?? "",
          quantity: r.quantity,
          unit_cost: cost ? cost.toFixed(2) : "",
          discount_pct: isTransferToStore ? discountPct.toFixed(1) : "",
          unit_price: unitRevenue ? unitRevenue.toFixed(2) : "",
          revenue: revenue ? revenue.toFixed(2) : "",
          profit: revenue ? (revenue - totalCost).toFixed(2) : "",
          sold_by: r.creator?.full_name ?? "",
          note: r.reason ?? "",
        };
      });

    if (rows.length === 0) throw new Error("No sales in the selected range");
    downloadCSV(rows, `sales-by-location-${scope}${dateSuffix(startDate, endDate)}`);
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
    if (startISO) query.gte("created_at", startISO);
    if (endISO) query.lt("created_at", endISO);
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
    if (rows.length === 0) throw new Error("No movements in the selected range");
    downloadCSV(rows, `stock-movements-${scope}${dateSuffix(startDate, endDate)}`);
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
    downloadCSV(rows, `low-stock-${scope}`);
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
