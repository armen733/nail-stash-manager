import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileDown, CheckCircle2, Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const PARTNER_CATEGORY = "NÉRA x OhLaLa";
export const OUR_SHARE = 0.4;

interface SaleLine {
  id: string;
  date: string;
  invoice: string;
  customer: string;
  product: string;
  sku: string;
  qty: number;
  unit: number;
  total: number;
}

interface Payout {
  id: string;
  period_start: string;
  period_end: string;
  total_sales: number;
  our_share: number;
  partner_share: number;
  paid_at: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

export function PartnerSalesTab({ locationId, partnerName }: { locationId: string; partnerName: string }) {
  const [start, setStart] = useState(() => {
    const t = today();
    return t.slice(0, 8) + "01";
  });
  const [end, setEnd] = useState(today);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPayouts = async () => {
    const { data } = await supabase
      .from("partner_payouts")
      .select("id, period_start, period_end, total_sales, our_share, partner_share, paid_at")
      .eq("location_id", locationId)
      .order("period_end", { ascending: false });
    setPayouts((data as Payout[]) ?? []);
  };

  const loadSales = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("order_items")
      .select(
        "id, quantity, unit_price, line_total, products!inner(name, sku, category), orders!inner(order_date, status, invoice_number, customer_name)"
      )
      .eq("products.category", PARTNER_CATEGORY)
      .neq("orders.status", "Draft")
      .gte("orders.order_date", start)
      .lte("orders.order_date", end);
    setLoading(false);
    if (error) {
      toast.error("Could not load partner sales");
      return;
    }
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      date: r.orders.order_date,
      invoice: r.orders.invoice_number ?? "",
      customer: r.orders.customer_name ?? "",
      product: r.products.name,
      sku: r.products.sku,
      qty: r.quantity,
      unit: Number(r.unit_price),
      total: Number(r.line_total ?? r.unit_price * r.quantity),
    }));
    rows.sort((a, b) => a.date.localeCompare(b.date));
    setLines(rows);
  };

  useEffect(() => {
    loadPayouts();
  }, [locationId]);
  useEffect(() => {
    if (start && end) loadSales();
  }, [start, end]);

  const totals = useMemo(() => {
    const sales = lines.reduce((s, l) => s + l.total, 0);
    const ours = Math.round(sales * OUR_SHARE * 100) / 100;
    return { sales, ours, theirs: Math.round((sales - ours) * 100) / 100, qty: lines.reduce((s, l) => s + l.qty, 0) };
  }, [lines]);

  const downloadPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`NÉRA x ${partnerName} — Sales Report`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Period: ${start} to ${end}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [["Date", "Invoice", "Customer", "Product", "SKU", "Qty", "Price", "Total"]],
      body: lines.map((l) => [l.date, l.invoice, l.customer, l.product, l.sku, String(l.qty), money(l.unit), money(l.total)]),
      foot: [["", "", "", "", "Total", String(totals.qty), "", money(totals.sales)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [40, 40, 40] },
      footStyles: { fillColor: [240, 240, 240], textColor: 20 },
    });
    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.text(`Total sales: ${money(totals.sales)}`, 14, y);
    doc.text(`NÉRA share (40%): ${money(totals.ours)}`, 14, y + 7);
    doc.text(`${partnerName} share (60%) — amount owed: ${money(totals.theirs)}`, 14, y + 14);
    doc.save(`${partnerName}-report-${start}-to-${end}.pdf`);
  };

  const markPaid = async () => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("partner_payouts").insert({
      location_id: locationId,
      period_start: start,
      period_end: end,
      total_sales: totals.sales,
      our_share: totals.ours,
      partner_share: totals.theirs,
      created_by: u.user?.id ?? null,
    });
    if (error) return toast.error("Could not save payout");
    toast.success(`Payout of ${money(totals.theirs)} recorded`);
    loadPayouts();
  };

  const removePayout = async (id: string) => {
    if (!confirm("Remove this payout record?")) return;
    await supabase.from("partner_payouts").delete().eq("id", id);
    loadPayouts();
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-muted p-2">
              <div className="text-xs text-muted-foreground">Sales</div>
              <div className="font-semibold">{money(totals.sales)}</div>
            </div>
            <div className="rounded-md bg-muted p-2">
              <div className="text-xs text-muted-foreground">Ours (40%)</div>
              <div className="font-semibold">{money(totals.ours)}</div>
            </div>
            <div className="rounded-md bg-primary/10 p-2">
              <div className="text-xs text-muted-foreground">Owed (60%)</div>
              <div className="font-semibold text-primary">{money(totals.theirs)}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={downloadPdf} disabled={!lines.length}>
              <FileDown className="h-4 w-4 mr-1" /> Download PDF report
            </Button>
            <Button size="sm" onClick={markPaid} disabled={!lines.length}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Mark {money(totals.theirs)} paid
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : !lines.length ? (
            <p className="p-4 text-sm text-muted-foreground">No {PARTNER_CATEGORY} sales in this period.</p>
          ) : (
            lines.map((l) => (
              <div key={l.id} className="p-3 flex justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{l.product}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.sku} · {l.date} · {l.invoice} {l.customer && `· ${l.customer}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-medium">{money(l.total)}</div>
                  <div className="text-xs text-muted-foreground">{l.qty} × {money(l.unit)}</div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-2">Payment history</h3>
          {!payouts.length ? (
            <p className="text-sm text-muted-foreground">No payouts recorded yet.</p>
          ) : (
            <div className="divide-y">
              {payouts.map((p) => (
                <div key={p.id} className="py-2 flex items-center justify-between text-sm gap-2">
                  <div>
                    <div>{p.period_start} → {p.period_end}</div>
                    <div className="text-xs text-muted-foreground">
                      Sales {money(Number(p.total_sales))} · paid {new Date(p.paid_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{money(Number(p.partner_share))}</span>
                    <Button size="icon" variant="ghost" onClick={() => removePayout(p.id)} aria-label="Remove payout">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
