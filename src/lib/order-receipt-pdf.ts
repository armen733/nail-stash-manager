import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { NERA_PACKING_LOGO } from "./packingLogo";

export interface ReceiptOrder {
  id: string;
  order_date: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  discount_amount?: number | null;
  discount_code?: string | null;
  points_redeemed?: number | null;
  notes?: string | null;
  shipping?: number | null;
  shipping_zone?: string | null;
  customer_name?: string | null;
  customer_address?: string | null;
  salons?: { name: string } | null;
  order_items?: {
    quantity: number;
    unit_price: number;
    products?: {
      name: string;
      sku?: string;
    } | null;
  }[];
}

const statusColor = (status: string): [number, number, number] => {
  switch (status) {
    case "Draft":
      return [146, 64, 14]; // #92400e
    case "Confirmed":
      return [30, 64, 175]; // #1e40af
    case "Shipped":
      return [124, 58, 237]; // #7c3aed
    case "Delivered":
    case "Paid":
      return [6, 95, 70]; // #065f46
    default:
      return [68, 68, 68];
  }
};

const statusFill = (status: string): [number, number, number] => {
  switch (status) {
    case "Draft":
      return [254, 243, 199]; // #fef3c7
    case "Confirmed":
      return [219, 234, 254]; // #dbeafe
    case "Shipped":
      return [233, 213, 255]; // #e9d5ff
    case "Delivered":
    case "Paid":
      return [209, 250, 229]; // #d1fae5
    default:
      return [240, 240, 240];
  }
};

export function generateOrderReceiptPDF(order: ReceiptOrder) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const orderNo = order.id.slice(0, 8).toUpperCase();
  const dateStr = new Date(order.order_date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const shipName = order.salons?.name || order.customer_name || "—";
  const shipAddress = order.customer_address || "";

  // Logo
  try {
    const props = doc.getImageProperties(NERA_PACKING_LOGO);
    const logoH = 18;
    const logoW = (props.width / props.height) * logoH;
    doc.addImage(NERA_PACKING_LOGO, "JPEG", 14, 10, logoW, logoH);
  } catch {
    // If logo fails, fall back to text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(17, 17, 17);
    doc.text("NÉRA Beauty", 14, 20);
  }

  // Order info block (right side)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Order #${orderNo}`, pageWidth - 14, 18, { align: "right" });
  doc.text(dateStr, pageWidth - 14, 23, { align: "right" });

  // Status badge
  const badgeW = doc.getTextWidth(order.status) + 6;
  const badgeX = pageWidth - 14 - badgeW;
  doc.setFillColor(...statusFill(order.status));
  doc.roundedRect(badgeX, 26, badgeW, 6, 2, 2, "F");
  doc.setTextColor(...statusColor(order.status));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(order.status, pageWidth - 14 - badgeW / 2, 30, { align: "center" });
  doc.setTextColor(0);

  // Divider
  doc.setDrawColor(220);
  doc.setLineWidth(0.5);
  doc.line(14, 40, pageWidth - 14, 40);

  // Ship To
  let y = 48;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("SHIP TO", 14, y);
  y += 6;
  doc.setTextColor(17);
  doc.text(shipName, 14, y);
  y += 5;
  if (shipAddress) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60);
    const addressLines = doc.splitTextToSize(shipAddress, 90);
    (addressLines as string[]).forEach((line) => {
      doc.text(line, 14, y);
      y += 5;
    });
  }

  // Items table
  const tableHead = [["Product", "Qty", "Price", "Total"]];
  const tableBody = (order.order_items || []).map((item) => [
    `${item.products?.name || "Unknown"}${item.products?.sku ? `\n${item.products.sku}` : ""}`,
    String(item.quantity),
    `$${item.unit_price.toFixed(2)}`,
    `$${(item.quantity * item.unit_price).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: Math.max(y + 4, 62),
    head: tableHead,
    body: tableBody,
    margin: { left: 14, right: 14, bottom: 60 },
    styles: { fontSize: 9, cellPadding: 2, textColor: [45, 45, 45], overflow: "linebreak" },
    headStyles: { fillColor: [245, 245, 245], textColor: [17, 17, 17], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "center", cellWidth: 20 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 35 },
    },
    rowPageBreak: "avoid",
    pageBreak: "auto",
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? 90;

  // Totals box
  const totalsX = pageWidth - 82;
  const totalsW = 68;
  let rowY = finalY + 8;
  const lineHeight = 6;

  const totals: { label: string; value: string; bold?: boolean; color?: [number, number, number] }[] = [
    { label: "Subtotal", value: `$${order.subtotal.toFixed(2)}` },
  ];
  if ((order.discount_amount ?? 0) > 0) {
    totals.push({
      label: `Discount${order.discount_code ? ` (${order.discount_code})` : ""}`,
      value: `-$${Number(order.discount_amount).toFixed(2)}`,
      color: [5, 150, 105],
    });
  }
  if ((order.points_redeemed ?? 0) > 0) {
    totals.push({
      label: `Points Redeemed (${order.points_redeemed} pts)`,
      value: '',
      color: [5, 150, 105],
    });
  }
  totals.push({ label: "Tax", value: `$${order.tax.toFixed(2)}` });
  if ((order.shipping ?? 0) > 0 || order.shipping_zone) {
    totals.push({
      label: `Shipping${order.shipping_zone ? ` (${order.shipping_zone})` : ""}`,
      value: (order.shipping ?? 0) > 0 ? `$${(order.shipping ?? 0).toFixed(2)}` : "FREE",
    });
  }
  totals.push({ label: "Total", value: `$${order.total.toFixed(2)}`, bold: true });

  totals.forEach((t, idx) => {
    if (t.bold) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(17);
    } else if (t.color) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...t.color);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(60);
    }
    doc.text(t.label, totalsX, rowY);
    doc.text(t.value, totalsX + totalsW, rowY, { align: "right" });
    if (idx === totals.length - 2) {
      doc.setDrawColor(17);
      doc.setLineWidth(0.35);
      doc.line(totalsX, rowY + 1.5, totalsX + totalsW, rowY + 1.5);
    }
    rowY += lineHeight;
  });

  // Notes
  if (order.notes) {
    const notesY = rowY + 6;
    doc.setFillColor(249, 249, 249);
    doc.roundedRect(14, notesY, pageWidth - 28, 12, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("Notes", 18, notesY + 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60);
    const noteLines = doc.splitTextToSize(order.notes, pageWidth - 40);
    (noteLines as string[]).forEach((line, idx) => {
      doc.text(line, 18, notesY + 10 + idx * 4.5);
    });
  }

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text("Thank you for your business!", pageWidth / 2, pageHeight - 12, { align: "center" });

  const filename = `receipt-${orderNo.toLowerCase()}.pdf`;
  doc.save(filename);
}
