import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PRODUCT_SALES_QUERY_KEY = ["product-sales"] as const;

/**
 * Total units sold per product_id, aggregated from order_items.
 */
async function fetchProductSales(): Promise<Record<string, number>> {
  const PAGE_SIZE = 1000;
  const totals: Record<string, number> = {};
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from("order_items")
      .select("product_id,quantity")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data as { product_id: string | null; quantity: number | null }[]) {
      if (!row.product_id) continue;
      totals[row.product_id] = (totals[row.product_id] || 0) + (Number(row.quantity) || 0);
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  return totals;
}

export function useProductSales() {
  return useQuery({
    queryKey: PRODUCT_SALES_QUERY_KEY,
    queryFn: fetchProductSales,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}
