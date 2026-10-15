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
import neraBeautyLogo from "@/assets/nera-beauty-logo.png";
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
          .from("products")
          .select("id, name, sku, variant_name, bit_type, price_usd, stock_on_hand")
          .eq("category", PARTNER_CATEGORY)
          .order("name"),
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
      const rows = (stockRes.data ?? []).map((p: any) => {
        const r = { product: p, quantity: Number(p.stock_on_hand ?? 0) };
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

  const printSheet = async (withSales: boolean) => {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to print"); return; }
    setBusy(true);
    try {
      const [pRes, sRes, cRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, sku, variant_name, bit_type, price_usd, stock_on_hand, product_images(image_url, display_order)")
          .eq("category", PARTNER_CATEGORY)
          .order("name"),
        withSales
          ? supabase
              .from("order_items")
              .select("product_id, quantity, line_total, products!inner(category), orders!inner(status)")
              .eq("products.category", PARTNER_CATEGORY)
              .neq("orders.status", "Draft")
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from("company_settings").select("company_name, logo_url, contact_phone, contact_email").maybeSingle(),
      ]);
      if (pRes.error) throw pRes.error;
      const company: any = cRes.data ?? {};
      const logo = company.logo_url || new URL(neraBeautyLogo, window.location.origin).href;
      const email = company.contact_email || "info@nerabeautyus.com";
      const phones = company.contact_phone || "";
      const sold = new Map<string, { qty: number; total: number }>();
      ((sRes as any).data ?? []).forEach((s: any) => {
        const c = sold.get(s.product_id) ?? { qty: 0, total: 0 };
        c.qty += s.quantity; c.total += Number(s.line_total ?? 0);
        sold.set(s.product_id, c);
      });
      const esc = (t: any) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
      const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const THEIR_SHARE = 1 - OUR_SHARE;
      const pct = (n: number) => `${Math.round(n * 100)}%`;
      let tUnits = 0, tValue = 0, tSold = 0, tSales = 0;
      const body = ((pRes.data ?? []) as any[]).map((p) => {
        const img = [...(p.product_images ?? [])].sort((a: any, b: any) => a.display_order - b.display_order)[0]?.image_url;
        const qty = Number(p.stock_on_hand ?? 0);
        const price = Number(p.price_usd ?? 0);
        const s = sold.get(p.id) ?? { qty: 0, total: 0 };
        tUnits += qty; tValue += qty * price; tSold += s.qty; tSales += s.total;
        const split = withSales
          ? `<td class="n">${s.qty}</td><td class="n">${money(s.total)}</td><td class="n">${money(s.total * OUR_SHARE)}</td><td class="n">${money(s.total * THEIR_SHARE)}</td>`
          : `<td class="n">${money(qty * price * OUR_SHARE)}</td><td class="n">${money(qty * price * THEIR_SHARE)}</td>`;
        return `<tr><td>${img ? `<img src="${esc(img)}">` : ""}</td><td>${esc(p.name)}</td><td>${esc(p.sku)}</td><td>${esc(p.variant_name ?? p.bit_type ?? "")}</td><td class="n">${money(price)}</td><td class="n">${qty}</td><td class="n">${money(qty * price)}</td>${split}</tr>`;
      }).join("");
      const head = `<th></th><th>Product</th><th>SKU</th><th>Type</th><th class="n">Price</th><th class="n">In stock</th><th class="n">Stock value</th>${
        withSales
          ? `<th class="n">Sold</th><th class="n">Sales</th><th class="n">Ours ${pct(OUR_SHARE)}</th><th class="n">${esc(partnerName)} ${pct(THEIR_SHARE)}</th>`
          : `<th class="n">Ours ${pct(OUR_SHARE)}</th><th class="n">${esc(partnerName)} ${pct(THEIR_SHARE)}</th>`
      }`;
      const foot = `<td></td><td colspan="4"><b>Total</b></td><td class="n"><b>${tUnits}</b></td><td class="n"><b>${money(tValue)}</b></td>${
        withSales
          ? `<td class="n"><b>${tSold}</b></td><td class="n"><b>${money(tSales)}</b></td><td class="n"><b>${money(tSales * OUR_SHARE)}</b></td><td class="n"><b>${money(tSales * THEIR_SHARE)}</b></td>`
          : `<td class="n"><b>${money(tValue * OUR_SHARE)}</b></td><td class="n"><b>${money(tValue * THEIR_SHARE)}</b></td>`
      }`;
      const row = (label: string, total: number, strong = false) =>
        `<tr${strong ? ' class="big"' : ""}><td>${label}</td><td class="n">${money(total)}</td><td class="n">${money(total * OUR_SHARE)}</td><td class="n">${money(total * THEIR_SHARE)}</td></tr>`;
      const summary = `<table class="sum"><thead><tr><th></th><th class="n">Total</th><th class="n">Ours ${pct(OUR_SHARE)}</th><th class="n">${esc(partnerName)} ${pct(THEIR_SHARE)}</th></tr></thead><tbody>${
        withSales ? row(`Already sold (${tSold} units)`, tSales) : ""
      }${row(`Stock left to sell (${tUnits} units)`, tValue)}${
        row(withSales ? "Overall possible (sold + stock left)" : "Possible if all stock sells at full price", tSales + tValue, true)
      }</tbody></table><p class="note">${esc(partnerName)} possible earnings: <b>${money((tSales + tValue) * THEIR_SHARE)}</b> &nbsp;·&nbsp; Our possible profit: <b>${money((tSales + tValue) * OUR_SHARE)}</b>. Based on full selling price, before tax and shipping.</p>`;
      const contact = `<div class="contact"><b>${esc(company.company_name || "NÉRA Beauty")}</b><br>${esc(email)}${phones ? `<br>${esc(phones).replace(/,\s*/g, "<br>")}` : ""}</div>`;
      w.document.write(`<!doctype html><html><head><title>${esc(partnerName)} stock</title><style>@page{margin:0}body{font-family:system-ui,sans-serif;padding:14mm;font-size:11px;color:#111}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}.top img{width:90px;height:auto;border-radius:0;object-fit:contain}.contact{text-align:right;line-height:1.5}h1{font-size:18px;margin:0}p{color:#666;margin:2px 0 12px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:5px;text-align:left;vertical-align:middle}th{background:#f4f4f4}.n{text-align:right}td img{width:34px;height:34px;object-fit:cover;border-radius:4px}tfoot td{border-top:2px solid #111}tr{page-break-inside:avoid}.sum{width:auto;min-width:60%;margin:18px 0 6px auto;page-break-inside:avoid}.sum .big td{border-top:2px solid #111;font-weight:700;font-size:12px}.note{color:#111;font-size:12px;text-align:right}</style></head><body><div class="top"><img src="${esc(logo)}">${contact}</div><h1>NÉRA x ${esc(partnerName)} — ${withSales ? "Stock & sales" : "Stock overview"}</h1><p>${new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "long" })}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr>${foot}</tr></tfoot></table>${summary}<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
      w.document.close();
    } catch (e: any) {
      w.close();
      toast.error(e?.message ?? "Print failed");
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
          Export / Print
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => printSheet(false)}>Print stock overview (no sales)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => printSheet(true)}>Print stock & sales</DropdownMenuItem>
        <DropdownMenuItem onClick={exportStock}>Products & stock (CSV)</DropdownMenuItem>
        <DropdownMenuItem onClick={exportSales}>All sales with 40/60 split (CSV)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
