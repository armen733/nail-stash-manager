import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export interface StatementOrder {
  id: string;
  invoice_number: string | null;
  order_date: string;
  total: number;
  amount_paid: number;
  balance_due: number;
  status: string;
}

export interface StatementPayment {
  id: string;
  paid_at: string;
  amount: number;
  method: string;
  reference: string | null;
  order_invoice: string | null;
}

export interface StatementSalon {
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
}

export function generateSalonStatementPDF(opts: {
  salon: StatementSalon;
  orders: StatementOrder[];
  payments?: StatementPayment[];
  fromDate?: Date;
  toDate?: Date;
  companyName?: string;
}) {
  const { salon, orders, fromDate, toDate, companyName = "NÉRA Beauty" } = opts;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, 14, 18);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Account Statement", 14, 25);

  doc.setFontSize(9);
  doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy")}`, pageWidth - 14, 18, { align: "right" });
  if (fromDate || toDate) {
    const range = `${fromDate ? format(fromDate, "MMM dd, yyyy") : "Start"} – ${toDate ? format(toDate, "MMM dd, yyyy") : "Today"}`;
    doc.text(`Period: ${range}`, pageWidth - 14, 24, { align: "right" });
  }

  // Salon block
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Bill To:", 14, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 44;
  doc.text(salon.name, 14, y); y += 5;
  if (salon.contact_name) { doc.text(salon.contact_name, 14, y); y += 5; }
  if (salon.address) { doc.text(salon.address, 14, y); y += 5; }
  if (salon.city) { doc.text(salon.city, 14, y); y += 5; }
  if (salon.phone) { doc.text(salon.phone, 14, y); y += 5; }
  if (salon.email) { doc.text(salon.email, 14, y); y += 5; }

  // Cash-on-delivery: total billed = total paid, balance is always 0
  const totalBilled = orders.reduce((s, o) => s + Number(o.total), 0);

  const summaryY = Math.max(y + 4, 44);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Summary", pageWidth - 14, 38, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(`Total billed: $${totalBilled.toFixed(2)}`, pageWidth - 14, 44, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text(`Total paid:   $${totalBilled.toFixed(2)}`, pageWidth - 14, 50, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 120, 50);
  doc.text(`Balance due:  $0.00`, pageWidth - 14, 56, { align: "right" });
  doc.setTextColor(0);

  // Orders table — all marked Paid (cash-on-delivery)
  autoTable(doc, {
    startY: Math.max(summaryY + 6, 70),
    head: [["Date", "Invoice #", "Status", "Total", "Paid"]],
    body: orders.map((o) => [
      format(new Date(o.order_date), "MMM dd, yyyy"),
      o.invoice_number ?? "—",
      "Paid",
      `$${Number(o.total).toFixed(2)}`,
      `$${Number(o.total).toFixed(2)}`,
    ]),
    foot: [["", "", "Totals", `$${totalBilled.toFixed(2)}`, `$${totalBilled.toFixed(2)}`]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Thank you for your business. All orders paid in full on delivery.",
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );

  const filename = `statement-${salon.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${format(new Date(), "yyyyMMdd")}.pdf`;
  doc.save(filename);
}
