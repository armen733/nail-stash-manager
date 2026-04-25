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
    // Per-product summary for the selected location:
    //   received qty (stock that came IN), sold qty (stock that went OUT as sale or transfer-to-supply-store),
    //   our unit cost, avg sale price, revenue, profit, profit %.
    // Falls back to per-movement rows when no location is selected (cross-location view).
    // Look up the selected location to know if it's a supply-store/consignment location.
    let scopedLocation: { id: string; type: string; supply_store_id: string | null } | null = null;
    if (locationId) {
      const { data: locRow } = await supabase
        .from("stock_locations")
        .select("id, type, supply_store_id")
        .eq("id", locationId)
        .maybeSingle();
      if (locRow) scopedLocation = locRow as any;
    }
    const isSupplyStoreLocation =
      scopedLocation?.type === "consignment" && !!scopedLocation?.supply_store_id;

    const [movementsRes, supplyStoresRes, overridesRes] = await Promise.all([
      (() => {
        const q = supabase
          .from("stock_movements")
          .select(
            "created_at, quantity, unit_cost, movement_type, from_location_id, to_location_id, product_id, from_loc:stock_locations!stock_movements_from_location_id_fkey(name, supply_store_id), to_loc:stock_locations!stock_movements_to_location_id_fkey(name, supply_store_id), product:products(name, sku, cost_usd, wholesale_price_usd, price_usd)"
          )
          .order("created_at", { ascending: false });
        if (locationId) {
          q.or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`);
        } else {
          q.in("movement_type", ["sale", "transfer"]);
        }
        if (startISO) q.gte("created_at", startISO);
        if (endISO) q.lt("created_at", endISO);
        return q;
      })(),
      supabase
        .from("supply_stores")
        .select("id, name, default_discount_percent, default_markup_percent"),
      supabase
        .from("supply_store_products")
        .select(
          "supply_store_id, product_id, discount_percent_override, markup_percent_override"
        ),
    ]);
    if (movementsRes.error) throw movementsRes.error;

    const storeById = new Map<
      string,
      { name: string; discount: number; markup: number }
    >();
    (supplyStoresRes.data ?? []).forEach((s: any) =>
      storeById.set(s.id, {
        name: s.name,
        discount: Number(s.default_discount_percent) || 0,
        markup: Number(s.default_markup_percent) || 0,
      }),
    );
    const overrideMap = new Map<
      string,
      { discount: number | null; markup: number | null }
    >();
    (overridesRes.data ?? []).forEach((o: any) => {
      overrideMap.set(`${o.supply_store_id}:${o.product_id}`, {
        discount: o.discount_percent_override != null ? Number(o.discount_percent_override) : null,
        markup: o.markup_percent_override != null ? Number(o.markup_percent_override) : null,
      });
    });

    // === Supply-store location: report what WE sold to this store ===
    if (locationId && isSupplyStoreLocation && scopedLocation) {
      const storeId = scopedLocation.supply_store_id!;
      const store = storeById.get(storeId);

      type Agg = {
        sku: string;
        product: string;
        unit_cost: number;
        wholesale: number;
        retail: number;
        discount_pct: number;
        markup_pct: number;
        sale_price_to_store: number;
        recommended_resale_price: number;
        received_qty: number; // qty we sold to the store (inbound transfers)
        returned_qty: number; // qty returned from store back to us (outbound transfers)
        sold_to_customer_qty: number; // qty the store sold to end customers (outbound sale)
      };
      const byProduct = new Map<string, Agg>();

      const initAgg = (productId: string, prod: any): Agg => {
        let a = byProduct.get(productId);
        if (a) return a;
        const cost = Number(prod?.cost_usd ?? 0);
        const wholesale = Number(prod?.wholesale_price_usd ?? prod?.price_usd ?? 0);
        const retail = Number(prod?.price_usd ?? 0);
        const overrideKey = `${storeId}:${productId}`;
        const ov = overrideMap.get(overrideKey);
        const discountPct =
          ov?.discount != null ? ov.discount : store?.discount ?? 0;
        const markupPct = ov?.markup != null ? ov.markup : store?.markup ?? 0;
        const salePriceToStore = wholesale * (1 - discountPct / 100);
        const recommendedResale = wholesale * (1 + markupPct / 100);
        a = {
          sku: prod?.sku ?? "",
          product: prod?.name ?? "",
          unit_cost: cost,
          wholesale,
          retail,
          discount_pct: discountPct,
          markup_pct: markupPct,
          sale_price_to_store: salePriceToStore,
          recommended_resale_price: recommendedResale,
          received_qty: 0,
          returned_qty: 0,
          sold_to_customer_qty: 0,
        };
        byProduct.set(productId, a);
        return a;
      };

      for (const r of (movementsRes.data ?? []) as any[]) {
        const pid = r.product_id;
        if (!pid) continue;
        const qty = Number(r.quantity) || 0;
        const inbound = r.to_location_id === locationId;
        const outbound = r.from_location_id === locationId;
        const agg = initAgg(pid, r.product);

        // Inbound transfer from our warehouse → this supply store = "we sold to them"
        if (inbound && (r.movement_type === "transfer" || r.movement_type === "initial")) {
          agg.received_qty += qty;
        }
        // Outbound transfer back to our warehouse = return from store
        if (outbound && r.movement_type === "transfer") {
          agg.returned_qty += qty;
        }
        // Outbound sale = the store sold to an end customer
        if (outbound && r.movement_type === "sale") {
          agg.sold_to_customer_qty += qty;
        }
      }

      const rows = Array.from(byProduct.values())
        .filter((a) => a.received_qty > 0 || a.returned_qty > 0 || a.sold_to_customer_qty > 0)
        .sort(
          (a, b) =>
            b.sale_price_to_store * (b.received_qty - b.returned_qty) -
            a.sale_price_to_store * (a.received_qty - a.returned_qty),
        )
        .map((a) => {
          const netSoldToStore = a.received_qty - a.returned_qty;
          const revenue = a.sale_price_to_store * netSoldToStore;
          const totalCost = a.unit_cost * netSoldToStore;
          const profit = revenue - totalCost;
          const profitPct = revenue > 0 ? (profit / revenue) * 100 : 0;
          const remainingAtStore = netSoldToStore - a.sold_to_customer_qty;
          return {
            sku: a.sku,
            product: a.product,
            qty_sold_to_store: netSoldToStore,
            our_unit_cost: a.unit_cost ? a.unit_cost.toFixed(2) : "",
            wholesale_price: a.wholesale ? a.wholesale.toFixed(2) : "",
            discount_pct: `${a.discount_pct.toFixed(1)}%`,
            our_sale_price_to_store: a.sale_price_to_store
              ? a.sale_price_to_store.toFixed(2)
              : "",
            recommended_resale_price: a.recommended_resale_price
              ? a.recommended_resale_price.toFixed(2)
              : "",
            markup_pct: `${a.markup_pct.toFixed(1)}%`,
            revenue: revenue ? revenue.toFixed(2) : "0.00",
            total_cost: totalCost ? totalCost.toFixed(2) : "0.00",
            our_profit: netSoldToStore > 0 ? profit.toFixed(2) : "",
            profit_pct: revenue > 0 ? `${profitPct.toFixed(1)}%` : "",
            store_sold_to_customer_qty: a.sold_to_customer_qty,
            remaining_at_store: remainingAtStore,
          };
        });

      if (rows.length === 0) throw new Error("No activity in the selected range");
      downloadCSV(rows, `sales-by-location-${scope}${dateSuffix(startDate, endDate)}`);
      return rows.length;
    }

    // === Regular (warehouse / driver / FBA) per-product aggregation ===
    if (locationId) {
      type Agg = {
        sku: string;
        product: string;
        unit_cost: number;
        received_qty: number;
        sold_qty: number;
        revenue: number;
        sale_count: number;
        channels: Set<string>;
      };
      const byProduct = new Map<string, Agg>();

      const getAgg = (productId: string, sku: string, name: string, cost: number): Agg => {
        let a = byProduct.get(productId);
        if (!a) {
          a = { sku, product: name, unit_cost: cost, received_qty: 0, sold_qty: 0, revenue: 0, sale_count: 0, channels: new Set() };
          byProduct.set(productId, a);
        }
        return a;
      };

      for (const r of (movementsRes.data ?? []) as any[]) {
        const pid = r.product_id;
        if (!pid) continue;
        const cost = Number(r.product?.cost_usd ?? 0);
        const agg = getAgg(pid, r.product?.sku ?? "", r.product?.name ?? "", cost);
        const qty = Number(r.quantity) || 0;
        const inbound = r.to_location_id === locationId;
        const outbound = r.from_location_id === locationId;

        if (inbound && (r.movement_type === "receive" || r.movement_type === "transfer" || r.movement_type === "initial" || r.movement_type === "return")) {
          agg.received_qty += qty;
        }

        if (outbound) {
          // Direct sale from this location, OR transfer out to a supply store (wholesale "sale")
          const isTransferToSupply = r.movement_type === "transfer" && !!r.to_loc?.supply_store_id;
          const isSale = r.movement_type === "sale";
          if (isSale || isTransferToSupply) {
            let unitRevenue = 0;
            if (isSale) {
              unitRevenue = r.unit_cost ? Number(r.unit_cost) : Number(r.product?.price_usd ?? 0);
              agg.channels.add("Direct");
            } else if (isTransferToSupply) {
              const toStoreId = r.to_loc.supply_store_id;
              const toStore = storeById.get(toStoreId);
              const wholesale = Number(r.product?.wholesale_price_usd ?? r.product?.price_usd ?? 0);
              const overrideKey = `${toStoreId}:${pid}`;
              const ov = overrideMap.get(overrideKey);
              const discountPct = ov?.discount != null ? ov.discount : (toStore?.discount ?? 0);
              unitRevenue = wholesale * (1 - discountPct / 100);
              agg.channels.add(`Supply: ${toStore?.name ?? "Unknown"}`);
            }
            agg.sold_qty += qty;
            agg.revenue += unitRevenue * qty;
            agg.sale_count += 1;
          }
        }
      }

      const rows = Array.from(byProduct.values())
        .filter((a) => a.received_qty > 0 || a.sold_qty > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .map((a) => {
          const avgSalePrice = a.sold_qty > 0 ? a.revenue / a.sold_qty : 0;
          const totalCost = a.unit_cost * a.sold_qty;
          const profit = a.revenue - totalCost;
          const profitPct = a.revenue > 0 ? (profit / a.revenue) * 100 : 0;
          const remaining = a.received_qty - a.sold_qty;
          return {
            sku: a.sku,
            product: a.product,
            received_qty: a.received_qty,
            sold_qty: a.sold_qty,
            remaining_qty: remaining,
            unit_cost: a.unit_cost ? a.unit_cost.toFixed(2) : "",
            avg_sale_price: avgSalePrice ? avgSalePrice.toFixed(2) : "",
            revenue: a.revenue ? a.revenue.toFixed(2) : "0.00",
            total_cost: totalCost ? totalCost.toFixed(2) : "0.00",
            profit: a.sold_qty > 0 ? profit.toFixed(2) : "",
            profit_pct: a.sold_qty > 0 && a.revenue > 0 ? `${profitPct.toFixed(1)}%` : "",
            channels: Array.from(a.channels).join(", "),
          };
        });

      if (rows.length === 0) throw new Error("No activity in the selected range");
      downloadCSV(rows, `sales-by-location-${scope}${dateSuffix(startDate, endDate)}`);
      return rows.length;
    }

    // No location selected — keep per-movement detail across all locations
    const rows = (movementsRes.data ?? [])
      .filter((r: any) => {
        if (r.movement_type === "sale") return true;
        const toIsSupply = !!r.to_loc?.supply_store_id;
        const fromIsSupply = !!r.from_loc?.supply_store_id;
        return toIsSupply || fromIsSupply;
      })
      .map((r: any) => {
        const isTransferToStore = r.movement_type === "transfer" && !!r.to_loc?.supply_store_id;
        const storeId = isTransferToStore ? r.to_loc.supply_store_id : r.from_loc?.supply_store_id ?? null;
        const store = storeId ? storeById.get(storeId) : null;
        const wholesale = Number(r.product?.wholesale_price_usd ?? r.product?.price_usd ?? 0);
        const cost = Number(r.product?.cost_usd ?? 0);
        const productId = r.product_id;
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
        const profit = revenue - totalCost;
        const profitPct = revenue > 0 ? (profit / revenue) * 100 : 0;
        return {
          date: new Date(r.created_at).toISOString().split("T")[0],
          channel: r.movement_type === "sale" ? "Direct sale" : (isTransferToStore ? `Supply store: ${store?.name ?? "Unknown"}` : "Transfer"),
          from_location: r.from_loc?.name ?? "",
          to_location: r.to_loc?.name ?? "",
          sku: r.product?.sku ?? "",
          product: r.product?.name ?? "",
          quantity: r.quantity,
          unit_cost: cost ? cost.toFixed(2) : "",
          unit_price: unitRevenue ? unitRevenue.toFixed(2) : "",
          revenue: revenue ? revenue.toFixed(2) : "",
          profit: revenue ? profit.toFixed(2) : "",
          profit_pct: revenue > 0 ? `${profitPct.toFixed(1)}%` : "",
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
