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
  payments: StatementPayment[];
  fromDate?: Date;
  toDate?: Date;
  companyName?: string;
}) {
  const { salon, orders, payments, fromDate, toDate, companyName = "NÉRA Beauty" } = opts;
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

  // Totals summary
  const totalBilled = orders.reduce((s, o) => s + Number(o.total), 0);
  const totalPaid = orders.reduce((s, o) => s + Number(o.amount_paid), 0);
  const balance = orders.reduce((s, o) => s + Number(o.balance_due), 0);

  const summaryY = Math.max(y + 4, 44);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Summary", pageWidth - 14, 38, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(`Total billed: $${totalBilled.toFixed(2)}`, pageWidth - 14, 44, { align: "right" });
  doc.text(`Total paid:   $${totalPaid.toFixed(2)}`, pageWidth - 14, 50, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text(`Balance due:  $${balance.toFixed(2)}`, pageWidth - 14, 56, { align: "right" });

  // Orders table
  autoTable(doc, {
    startY: Math.max(summaryY + 6, 70),
    head: [["Date", "Invoice #", "Status", "Total", "Paid", "Balance"]],
    body: orders.map((o) => [
      format(new Date(o.order_date), "MMM dd, yyyy"),
      o.invoice_number ?? "—",
      o.status,
      `$${Number(o.total).toFixed(2)}`,
      `$${Number(o.amount_paid).toFixed(2)}`,
      `$${Number(o.balance_due).toFixed(2)}`,
    ]),
    foot: [["", "", "Totals", `$${totalBilled.toFixed(2)}`, `$${totalPaid.toFixed(2)}`, `$${balance.toFixed(2)}`]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  // Payments table
  if (payments.length > 0) {
    const lastY = (doc as any).lastAutoTable?.finalY ?? 100;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Payments Received", 14, lastY + 10);
    autoTable(doc, {
      startY: lastY + 14,
      head: [["Date", "Invoice #", "Method", "Reference", "Amount"]],
      body: payments.map((p) => [
        format(new Date(p.paid_at), "MMM dd, yyyy"),
        p.order_invoice ?? "—",
        p.method,
        p.reference ?? "",
        `$${Number(p.amount).toFixed(2)}`,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Please remit payment for the balance due. Contact us with any questions.",
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );

  const filename = `statement-${salon.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${format(new Date(), "yyyyMMdd")}.pdf`;
  doc.save(filename);
}
