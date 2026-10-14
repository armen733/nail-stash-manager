import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV } from "@/lib/csv-export";
import { OUR_SHARE, PARTNER_CATEGORY } from "@/components/warehouse/PartnerSalesTab";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function PartnerExportMenu({ locationId, partnerName }: { locationId: string; partnerName: string }) {
  const [busy, setBusy] = useState(false);
  const slug = partnerName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const exportStock = async () => {
    setBusy(true);
    try {
      const [stockRes, soldRes] = await Promise.all([
        supabase
          .from("product_stock")
          .select("quantity, reserved, product:products!inner(id, name, sku, variant_name, bit_type, price_usd, category)")
          .eq("location_id", locationId)
          .eq("product.category", PARTNER_CATEGORY),
        supabase
          .from("order_items")
          .select("product_id, quantity, line_total, products!inner(category), orders!inner(status)")
          .eq("products.category", PARTNER_CATEGORY)
          .neq("orders.status", "Draft"),
      ]);
      if (stockRes.error) throw stockRes.error;
      if (soldRes.error) throw soldRes.error;
      const sold = new Map<string, { qty: number; total: number }>();
      (soldRes.data ?? []).forEach((s: any) => {
        const cur = sold.get(s.product_id) ?? { qty: 0, total: 0 };
        cur.qty += s.quantity;
        cur.total += Number(s.line_total ?? 0);
        sold.set(s.product_id, cur);
      });
      const rows = (stockRes.data ?? []).map((r: any) => {
        const s = sold.get(r.product.id) ?? { qty: 0, total: 0 };
        return {
          sku: r.product.sku,
          product: r.product.name,
          type: r.product.variant_name ?? r.product.bit_type ?? "",
          price: Number(r.product.price_usd).toFixed(2),
          on_hand: r.quantity,
          units_sold: s.qty,
          total_sales: r2(s.total).toFixed(2),
          our_share_40: r2(s.total * OUR_SHARE).toFixed(2),
          [`${partnerName}_share_60`]: r2(s.total - s.total * OUR_SHARE).toFixed(2),
        };
      });
      if (rows.length === 0) throw new Error("No products to export yet");
      downloadCSV(rows, `${slug}-products`);
      toast.success(`Exported ${rows.length} products`);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const exportSales = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("order_items")
        .select(
          "quantity, unit_price, line_total, products!inner(name, sku, category), orders!inner(order_date, status, invoice_number, customer_name)"
        )
        .eq("products.category", PARTNER_CATEGORY)
        .neq("orders.status", "Draft");
      if (error) throw error;
      const rows = (data ?? [])
        .map((r: any) => ({
          date: r.orders.order_date,
          invoice: r.orders.invoice_number ?? "",
          customer: r.orders.customer_name ?? "",
          sku: r.products.sku,
          product: r.products.name,
          qty: r.quantity,
          unit_price: Number(r.unit_price).toFixed(2),
          total: Number(r.line_total).toFixed(2),
          our_share_40: r2(Number(r.line_total) * OUR_SHARE).toFixed(2),
          [`${partnerName}_share_60`]: r2(Number(r.line_total) * (1 - OUR_SHARE)).toFixed(2),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (rows.length === 0) throw new Error("No sales yet");
      downloadCSV(rows, `${slug}-sales`);
      toast.success(`Exported ${rows.length} sale lines`);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportStock}>Products & stock (CSV)</DropdownMenuItem>
        <DropdownMenuItem onClick={exportSales}>All sales with 40/60 split (CSV)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
