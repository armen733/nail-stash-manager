import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, CalendarIcon, FileText, Download, Receipt, Sheet } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { useTaxSettings } from "@/hooks/useTaxSettings";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { NERA_PACKING_LOGO } from "@/lib/packingLogo";

interface OrderRow {
  id: string;
  invoice_number: string | null;
  order_date: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  discount_amount: number | null;
  shipping: number | null;
}

const taxableBase = (o: OrderRow) =>
  Math.max(Number(o.subtotal || 0) - Number(o.discount_amount || 0), 0);


interface Props {
  companyName?: string;
}

export function SalesTaxReport({ companyName = "NÉRA Beauty" }: Props) {
  const { toast } = useToast();
  const { taxSettings, taxRate } = useTaxSettings();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [docNumberMode, setDocNumberMode] = useState<"invoice" | "order">("invoice");
  const [forceTaxable, setForceTaxable] = useState(false);
  const [overrideRate, setOverrideRate] = useState<string>("");

  const settingsRate = taxRate || Number(taxSettings?.tax_rate) || 0;
  const parsedOverride = parseFloat(overrideRate);
  const activeRate =
    forceTaxable && !isNaN(parsedOverride) && parsedOverride > 0
      ? parsedOverride
      : settingsRate;
  const taxName = taxSettings?.tax_name || "Sales Tax";

  useEffect(() => {
    if (!open || !range?.from || !range?.to) return;
    (async () => {
      setLoading(true);
      const from = format(range.from!, "yyyy-MM-dd");
      const to = format(range.to!, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("orders")
        .select("id, invoice_number, order_date, subtotal, tax, total, status, discount_amount, shipping")
        .gte("order_date", from)
        .lte("order_date", to)
        .in("status", ["Draft", "Confirmed", "Paid", "Shipped", "Delivered"])
        .order("order_date", { ascending: true });
      if (error) {
        toast({ title: "Failed to load orders", description: error.message, variant: "destructive" });
      } else {
        setOrders((data || []) as OrderRow[]);
      }
      setLoading(false);
    })();
  }, [open, range?.from, range?.to, toast]);

  // Tax is owed on the discounted merchandise subtotal (shipping excluded).
  const computeCalc = (o: OrderRow) => {
    const base = taxableBase(o);
    const tax = Number(o.tax || 0);
    if (forceTaxable) return +(base * (activeRate / 100)).toFixed(2);
    return tax > 0 ? tax : +(base * (activeRate / 100)).toFixed(2);
  };

  const totals = orders.reduce(
    (a, o) => {
      const base = taxableBase(o);
      const tax = Number(o.tax || 0);
      const total = Number(o.total || 0);
      const calcTax = computeCalc(o);
      const uncollectedPer = Math.max(calcTax - tax, 0);
      return {
        subtotal: a.subtotal + base,
        discounts: a.discounts + Number(o.discount_amount || 0),
        shipping: a.shipping + Number(o.shipping || 0),
        total: a.total + total,
        collected: a.collected + tax,
        calculated: a.calculated + calcTax,
        uncollected: a.uncollected + uncollectedPer,
      };
    },
    { subtotal: 0, discounts: 0, shipping: 0, total: 0, collected: 0, calculated: 0, uncollected: 0 }
  );


  const getDocNumber = (o: OrderRow) =>
    docNumberMode === "invoice" ? o.invoice_number ?? "—" : o.id.slice(0, 8).toUpperCase();

  const printPDF = () => {
    if (!range?.from || !range?.to) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    try {
      const props = doc.getImageProperties(NERA_PACKING_LOGO);
      const targetH = 16;
      const targetW = (props.width / props.height) * targetH;
      doc.addImage(NERA_PACKING_LOGO, "PNG", 14, 10, targetW, targetH);
    } catch {}
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(companyName, 46, 18);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Sales Tax Report", 46, 25);

    doc.setFontSize(9);
    doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy")}`, pageWidth - 14, 18, { align: "right" });
    doc.text(
      `Period: ${format(range.from, "MMM dd, yyyy")} – ${format(range.to, "MMM dd, yyyy")}`,
      pageWidth - 14,
      24,
      { align: "right" }
    );
    doc.text(`${taxName} rate: ${activeRate}%`, pageWidth - 14, 30, { align: "right" });

    // Summary box
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Summary", 14, 42);
    doc.setFont("helvetica", "normal");
    doc.text(`Orders: ${orders.length}`, 14, 48);
    doc.text(`Total revenue (gross): $${totals.total.toFixed(2)}`, 14, 54);
    doc.text(`Taxable base (after discounts, excl. shipping): $${totals.subtotal.toFixed(2)}`, 14, 60);
    doc.text(`Discounts: $${totals.discounts.toFixed(2)}   Shipping: $${totals.shipping.toFixed(2)}`, 14, 66);
    doc.text(`Tax collected: $${totals.collected.toFixed(2)}`, pageWidth - 14, 48, { align: "right" });
    doc.text(`Tax uncollected (calc.): $${totals.uncollected.toFixed(2)}`, pageWidth - 14, 54, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(`Total tax owed: $${totals.calculated.toFixed(2)}`, pageWidth - 14, 60, { align: "right" });

    autoTable(doc, {
      startY: 76,
      head: [["Date", docNumberMode === "invoice" ? "Invoice #" : "Order #", "Taxable Base", "Tax Collected", "Calculated Tax", "Total"]],
      body: orders.map((o) => {
        const base = taxableBase(o);
        const tax = Number(o.tax || 0);
        const calcTax = computeCalc(o);
        return [
          format(new Date(o.order_date), "MMM dd, yyyy"),
          getDocNumber(o),
          `$${base.toFixed(2)}`,
          `$${tax.toFixed(2)}`,
          `$${calcTax.toFixed(2)}`,
          `$${Number(o.total || 0).toFixed(2)}`,
        ];
      }),

      foot: [[
        "",
        "Totals",
        `$${totals.subtotal.toFixed(2)}`,
        `$${totals.collected.toFixed(2)}`,
        `$${totals.calculated.toFixed(2)}`,
        `$${totals.total.toFixed(2)}`,
      ]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });

    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      "Calculated Tax = Tax Collected when charged, otherwise taxable base (subtotal − discounts, shipping excluded) × current tax rate. Cancelled orders excluded.",
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );

    const filename = `sales-tax-${format(range.from, "yyyyMMdd")}-${format(range.to, "yyyyMMdd")}.pdf`;
    doc.save(filename);
  };

  const exportExcel = async () => {
    if (!range?.from || !range?.to) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = companyName;
    wb.created = new Date();
    const ws = wb.addWorksheet("Sales Tax Report");

    ws.columns = [
      { key: "date", width: 16 },
      { key: "doc", width: 18 },
      { key: "sub", width: 14 },
      { key: "collected", width: 16 },
      { key: "calc", width: 16 },
      { key: "total", width: 14 },
    ];

    const title = ws.addRow([companyName]);
    title.font = { name: "Arial", size: 16, bold: true };
    const sub = ws.addRow(["Sales Tax Report"]);
    sub.font = { name: "Arial", size: 12, bold: true };
    ws.addRow([`Period: ${format(range.from, "MMM dd, yyyy")} – ${format(range.to, "MMM dd, yyyy")}`]);
    ws.addRow([`Generated: ${format(new Date(), "MMM dd, yyyy")}`]);
    ws.addRow([`${taxName} rate: ${activeRate}%`]);
    ws.addRow([]);

    ws.addRow(["Summary"]).font = { name: "Arial", bold: true };
    const summary: [string, number][] = [
      ["Orders", orders.length],
      ["Total revenue (gross)", totals.total],
      ["Discounts", totals.discounts],
      ["Shipping (non-taxable)", totals.shipping],
      ["Taxable base (after discounts)", totals.subtotal],
      ["Tax collected", totals.collected],
      ["Tax uncollected (calc.)", totals.uncollected],
      ["Total tax owed", totals.calculated],
    ];

    summary.forEach(([label, value], i) => {
      const r = ws.addRow([label, value]);
      r.getCell(1).font = { name: "Arial" };
      r.getCell(2).font = { name: "Arial", bold: i === summary.length - 1 };
      if (i > 0) r.getCell(2).numFmt = '$#,##0.00;($#,##0.00);"-"';
    });
    ws.addRow([]);

    const headerRow = ws.addRow([
      "Date",
      docNumberMode === "invoice" ? "Invoice #" : "Order #",
      "Taxable Base",
      "Tax Collected",
      "Calculated Tax",
      "Total",
    ]);
    headerRow.eachCell((c) => {
      c.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF282828" } };
      c.alignment = { horizontal: "center" };
    });
    const firstDataRow = headerRow.number + 1;

    orders.forEach((o) => {
      const base = taxableBase(o);
      const t = Number(o.tax || 0);
      const r = ws.addRow([
        format(new Date(o.order_date), "MMM dd, yyyy"),
        getDocNumber(o),
        base,
        t,
        computeCalc(o),
        Number(o.total || 0),
      ]);

      r.eachCell((c, col) => {
        c.font = { name: "Arial" };
        if (col >= 3) c.numFmt = '$#,##0.00;($#,##0.00);"-"';
      });
    });

    const lastDataRow = firstDataRow + orders.length - 1;
    const totalsRow = ws.addRow(
      orders.length > 0
        ? [
            "",
            "Totals",
            { formula: `SUM(C${firstDataRow}:C${lastDataRow})` },
            { formula: `SUM(D${firstDataRow}:D${lastDataRow})` },
            { formula: `SUM(E${firstDataRow}:E${lastDataRow})` },
            { formula: `SUM(F${firstDataRow}:F${lastDataRow})` },
          ]
        : ["", "Totals", 0, 0, 0, 0]
    );
    totalsRow.eachCell((c, col) => {
      c.font = { name: "Arial", bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
      if (col >= 3) c.numFmt = '$#,##0.00;($#,##0.00);"-"';
    });

    ws.addRow([]);
    const note = ws.addRow([
      "Calculated Tax = Tax Collected when charged, otherwise taxable base (subtotal − discounts, shipping excluded) × current tax rate. Cancelled orders excluded.",
    ]);
    note.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF787878" } };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-tax-${format(range.from, "yyyyMMdd")}-${format(range.to, "yyyyMMdd")}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Excel exported", description: "Sales tax report saved as .xlsx" });
  };

  return (
    <Card className="shadow-[var(--shadow-card)] lg:col-span-2">
      <CardHeader
        className="p-4 sm:p-6 cursor-pointer hover:bg-muted/30 transition-colors select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Sales Tax Report (Accountant)
          </CardTitle>
          <ChevronDown
            className={cn(
              "h-5 w-5 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </div>
      </CardHeader>
      {open && (
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {range?.from && range?.to
                    ? `${format(range.from, "MMM dd, yyyy")} – ${format(range.to, "MMM dd, yyyy")}`
                    : "Pick date range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={setRange}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Badge variant="outline">
              {taxName}: {activeRate}%{!taxSettings?.is_active && " (inactive)"}
            </Badge>
            <ToggleGroup
              type="single"
              value={docNumberMode}
              onValueChange={(v) => v && setDocNumberMode(v as "invoice" | "order")}
              size="sm"
              className="border rounded-md p-0.5"
            >
              <ToggleGroupItem value="invoice" aria-label="Show invoice number" className="text-xs px-2 py-1 h-7">
                Invoice #
              </ToggleGroupItem>
              <ToggleGroupItem value="order" aria-label="Show order number" className="text-xs px-2 py-1 h-7">
                Order #
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              type="button"
              variant={forceTaxable ? "default" : "outline"}
              size="sm"
              onClick={() => setForceTaxable((v) => !v)}
              className="h-8 text-xs"
            >
              {forceTaxable ? `All Taxable: ON (${activeRate}%)` : "All Taxable: OFF"}
            </Button>
            {forceTaxable && (
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Rate %"
                value={overrideRate}
                onChange={(e) => setOverrideRate(e.target.value)}
                className="h-8 w-20 text-xs px-2 rounded-md border bg-background"
                title="Override tax rate for calculation"
              />
            )}
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={exportExcel} disabled={loading || orders.length === 0}>
              <Sheet className="h-4 w-4 mr-1" /> Export Excel
            </Button>
            <Button size="sm" onClick={printPDF} disabled={loading || orders.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Print PDF
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-md border bg-muted/20">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Orders</div>
              <div className="text-lg font-bold">{orders.length}</div>
            </div>
            <div className="p-3 rounded-md border bg-muted/20">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Revenue</div>
              <div className="text-lg font-bold">${totals.total.toFixed(2)}</div>
            </div>
            <div className="p-3 rounded-md border bg-muted/20">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Tax Collected</div>
              <div className="text-lg font-bold text-emerald-600">${totals.collected.toFixed(2)}</div>
            </div>
            <div className="p-3 rounded-md border bg-muted/20">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Total Tax Owed
              </div>
              <div className="text-lg font-bold text-primary">${totals.calculated.toFixed(2)}</div>
              {totals.uncollected > 0 && (
                <div className="text-[10px] text-amber-600 mt-0.5">
                  incl. ${totals.uncollected.toFixed(2)} uncollected
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">{docNumberMode === "invoice" ? "Invoice #" : "Order #"}</th>
                  <th className="text-right p-2">Taxable Base</th>
                  <th className="text-right p-2">Tax Collected</th>
                  <th className="text-right p-2">Calc. Tax</th>
                  <th className="text-right p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No orders in selected range.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const sub = taxableBase(o);
                    const tax = Number(o.tax || 0);
                    const calc = computeCalc(o);

                    return (
                      <tr key={o.id} className="border-t">
                        <td className="p-2">{format(new Date(o.order_date), "MMM dd, yyyy")}</td>
                        <td className="p-2 font-mono text-xs">{getDocNumber(o)}</td>
                        <td className="p-2 text-right">${sub.toFixed(2)}</td>
                        <td className="p-2 text-right text-emerald-600">${tax.toFixed(2)}</td>
                        <td className="p-2 text-right">${calc.toFixed(2)}</td>
                        <td className="p-2 text-right font-medium">${Number(o.total || 0).toFixed(2)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {orders.length > 0 && (
                <tfoot className="bg-muted/30 font-bold">
                  <tr>
                    <td className="p-2" colSpan={2}>Totals</td>
                    <td className="p-2 text-right">${totals.subtotal.toFixed(2)}</td>
                    <td className="p-2 text-right text-emerald-600">${totals.collected.toFixed(2)}</td>
                    <td className="p-2 text-right">${totals.calculated.toFixed(2)}</td>
                    <td className="p-2 text-right">${totals.total.toFixed(2)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            <FileText className="h-3 w-3 inline mr-1" />
            "Calc. Tax" uses the tax actually charged on the order when present; otherwise it applies the
            current {taxName} rate ({activeRate}%) to the subtotal. This lets you report the full tax
            liability even for orders that weren't charged tax at checkout.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
