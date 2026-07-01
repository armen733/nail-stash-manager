import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { computePricing } from "./wholesale-pricing";
import type { WholesaleCatalogRow } from "./wholesale-export";

export interface CompanyBrand {
  company_name: string;
  logo_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  tagline: string | null;
}

export type PrintableRow = WholesaleCatalogRow & { quantity?: number };

export interface PrintableCatalogGroup {
  title: string;
  subtitle?: string;
  rows: PrintableRow[];
}

export interface PrintableCatalogInput {
  brand: CompanyBrand;
  store: { name: string; contact_name: string | null; phone: string | null; email: string | null; address: string | null };
  rows: PrintableRow[];
  /** Optional grouped sections (e.g. one per delivery date). When provided, `rows` is ignored. */
  groups?: PrintableCatalogGroup[];
  /** Show totals box even for non-receipt catalog sheets (e.g. sample pricing sheet). */
  showTotals?: boolean;
}

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;

const safeFilePart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "wholesale-order";

const formatPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw.trim();
};

const loadImageDataUrl = async (url: string | null): Promise<string | null> => {
  if (!url) return null;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export function openPrintableCatalog({ brand, store, rows, groups, showTotals }: PrintableCatalogInput) {
  const isMobile =
    (/Android|iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) &&
    !(window as any).MSStream;

  void createWholesalePdf({ brand, store, rows, groups, showTotals, deliveryMode: isMobile ? "share" : "save" }).catch((error) => {
    console.error("Failed to create wholesale PDF", error);
  });
}

async function createWholesalePdf({
  brand,
  store,
  rows,
  groups,
  showTotals,
  deliveryMode = "save",
}: PrintableCatalogInput & { deliveryMode?: "save" | "share" }) {
  const sections: PrintableCatalogGroup[] = groups && groups.length > 0 ? groups : [{ title: "", rows }];
  const isReceipt = sections.some((g) => g.rows.some((r) => Number(r.quantity ?? 0) > 0));
  const shouldShowTotals = showTotals || isReceipt;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const logo = await loadImageDataUrl(brand.logo_url);
  let grandUnits = 0;
  let grandSubtotal = 0;
  let grandTotalDiscount = 0;
  let grandTotal = 0;

  const drawHeader = () => {
    let leftX = 14;
    if (logo) {
      doc.addImage(logo, "PNG", leftX, 12, 12, 12);
      leftX += 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(17, 17, 17);
    doc.text(brand.company_name || "NÉRA Beauty", leftX, 20);
    if (brand.tagline) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text(brand.tagline, leftX, 25);
    }

    const phoneLines = (brand.contact_phone ?? "")
      .split(/[,;\n]/)
      .map((s) => formatPhone(s))
      .filter(Boolean);
    const contactLines = [...phoneLines, brand.contact_email, brand.website].filter(Boolean) as string[];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(68);
    contactLines.slice(0, 4).forEach((line, idx) => {
      doc.text(line, pageWidth - 14, 16 + idx * 4, { align: "right" });
    });

    doc.setDrawColor(17, 17, 17);
    doc.setLineWidth(0.5);
    doc.line(14, 31, pageWidth - 14, 31);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(17);
    doc.text(isReceipt ? "Wholesale Order · Supply Partnership" : "Wholesale Catalog · Supply Partnership", 14, 40);

    doc.setFontSize(9);
    doc.text(`For: ${store.name}`, 14, 46);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    let y = 51;
    if (store.contact_name) {
      doc.text(store.contact_name, 14, y);
      y += 4;
    }
    if (store.address) {
      const lines = doc.splitTextToSize(store.address, 105);
      doc.text(lines, 14, y);
    }
    doc.text(`Date: ${today}`, pageWidth - 14, 46, { align: "right" });
  };

  const drawFooter = () => {
    doc.setDrawColor(220);
    doc.line(14, pageHeight - 19, pageWidth - 14, pageHeight - 19);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Prices in USD. Subject to change. ${brand.company_name || "NÉRA Beauty"} wholesale partnership.`, 14, pageHeight - 13);
  };

  sections.forEach((section, index) => {
    if (index > 0) doc.addPage();
    drawHeader();

    let startY = 56;
    if (section.title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(17);
      doc.text(section.title, 14, startY);
      if (section.subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(90);
        doc.text(section.subtitle, pageWidth - 14, startY, { align: "right" });
      }
      startY += 4;
    }

    let units = 0;
    let baseSubtotal = 0;
    let totalDiscount = 0;
    let total = 0;
    const tableRows = section.rows
      .map((row) => {
        const pricing = computePricing({
          basePrice: Number(row.basePrice ?? 0),
          discountPercent: Number(row.discountPercent ?? 0),
          markupPercent: Number(row.markupPercent ?? 0),
        });
        const qty = isReceipt ? Math.max(0, Math.floor(Number(row.quantity ?? 0))) : 1;
        if (isReceipt && qty <= 0) return null;
        const lineList = +(pricing.basePrice * qty).toFixed(2);
        const lineCost = +(pricing.storeCost * qty).toFixed(2);
        const lineDiscount = +(lineList - lineCost).toFixed(2);
        units += qty;
        baseSubtotal += lineList;
        totalDiscount += lineDiscount;
        total += lineCost;
        return isReceipt
          ? [
              row.sku,
              row.name,
              row.category,
              money(pricing.basePrice),
              `${pricing.discountPercent}%`,
              money(pricing.storeCost),
              String(qty),
              money(lineCost),
              `${pricing.markupPercent}%`,
              money(pricing.suggestedRetail),
            ]
          : [
              row.sku,
              row.name,
              row.category,
              money(pricing.basePrice),
              `${pricing.discountPercent}%`,
              money(pricing.storeCost),
              `${pricing.markupPercent}%`,
              money(pricing.suggestedRetail),
            ];
      })
      .filter(Boolean) as string[][];

    grandUnits += units;
    grandSubtotal += baseSubtotal;
    grandTotalDiscount += totalDiscount;
    grandTotal += total;

    autoTable(doc, {
      startY,
      head: isReceipt
        ? [["SKU", "Product", "Category", "List", "Disc.", "Cost", "Qty", "Total", "Markup %", "Retail"]]
        : [["SKU", "Product", "Category", "List", "Disc.", "Cost", "Markup %", "Retail"]],
      body: tableRows,
      margin: { left: 14, right: 14, bottom: 22 },
      styles: { fontSize: 6.4, cellPadding: 1.05, textColor: [45, 45, 45], overflow: "linebreak", minCellWidth: 2 },
      headStyles: { fillColor: [17, 17, 17], textColor: 255, fontStyle: "bold", fontSize: 6.1, cellPadding: 1.05 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: isReceipt
        ? {
            0: { cellWidth: 17 },
            1: { cellWidth: 29 },
            2: { cellWidth: 22 },
            3: { halign: "right", cellWidth: 15 },
            4: { halign: "right", cellWidth: 12 },
            5: { halign: "right", cellWidth: 16, fontStyle: "bold" },
            6: { halign: "right", cellWidth: 9 },
            7: { halign: "right", cellWidth: 17, fontStyle: "bold" },
            8: { halign: "right", cellWidth: 16, textColor: [100, 100, 100] },
            9: { halign: "right", cellWidth: 17, textColor: [100, 100, 100] },
          }
        : {
            0: { cellWidth: 24 },
            1: { cellWidth: 49 },
            2: { cellWidth: 34 },
            3: { halign: "right" },
            4: { halign: "right" },
            5: { halign: "right", fontStyle: "bold" },
            6: { halign: "right", textColor: [100, 100, 100] },
            7: { halign: "right", textColor: [100, 100, 100] },
          },
      didDrawPage: drawFooter,
      pageBreak: "auto",
      rowPageBreak: "avoid",
    });

    if (shouldShowTotals) {
      const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 20;
      const totalsY = finalY + 12 > pageHeight - 42 ? pageHeight - 42 : finalY + 12;
      const boxX = pageWidth - 82;
      const boxW = 68;
      const lineHeight = 5.5;
      let rowY = totalsY - 5.5;
      const rows = [
        ...(isReceipt ? [{ label: "Units", value: String(units) }] : []),
        { label: "Subtotal", value: money(baseSubtotal) },
        { label: "Discount", value: `-${money(totalDiscount)}` },
        { label: "Total", value: money(total), bold: true },
      ];
      const boxH = rows.length * lineHeight + 2;
      doc.setFillColor(248, 248, 248);
      doc.rect(boxX, rowY, boxW, boxH, "F");
      doc.setDrawColor(17);
      doc.setLineWidth(0.35);
      rows.forEach((r, idx) => {
        const y = rowY + idx * lineHeight + 4.2;
        if (r.bold) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(17);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(40);
        }
        doc.text(r.label, boxX + 2, y);
        doc.text(r.value, boxX + boxW - 2, y, { align: "right" });
        if (idx === rows.length - 2) {
          doc.setDrawColor(17);
          doc.line(boxX, y + 1.2, boxX + boxW, y + 1.2);
        }
      });
    }
  });

  if (shouldShowTotals && sections.length > 1) {
    const finalY = (doc as any).lastAutoTable?.finalY ?? 70;
    const y = Math.min(finalY + 24, pageHeight - 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Total units (all deliveries)", pageWidth - 88, y);
    doc.text(String(grandUnits), pageWidth - 14, y, { align: "right" });
    doc.text("Subtotal", pageWidth - 88, y + 6);
    doc.text(money(grandSubtotal), pageWidth - 14, y + 6, { align: "right" });
    doc.text("Discount", pageWidth - 88, y + 12);
    doc.text(`-${money(grandTotalDiscount)}`, pageWidth - 14, y + 12, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text("Grand total", pageWidth - 88, y + 20);
    doc.text(money(grandTotal), pageWidth - 14, y + 20, { align: "right" });
  }

  const filename = isReceipt
    ? `${safeFilePart(store.name)}-order.pdf`
    : `${safeFilePart(store.name)}-pricing-sheet.pdf`;

  if (deliveryMode === "share") {
    await shareOrOpenPdf(doc, filename);
    return;
  }

  doc.save(filename);
}

async function shareOrOpenPdf(doc: jsPDF, filename: string) {
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };

  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}