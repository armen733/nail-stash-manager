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

export function openPrintableCatalog({ brand, store, rows, groups }: PrintableCatalogInput) {
  const isMobile = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent) && !(window as any).MSStream;
  const popup = isMobile ? window.open("", "_blank") : null;
  if (popup) {
    popup.document.write(
      '<!doctype html><title>Preparing PDF</title><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;color:#111">Preparing PDF…</body>',
    );
  }

  void createWholesalePdf({ brand, store, rows, groups, popup }).catch((error) => {
    console.error("Failed to create wholesale PDF", error);
    popup?.close();
  });
}

async function createWholesalePdf({
  brand,
  store,
  rows,
  groups,
  popup,
}: PrintableCatalogInput & { popup?: Window | null }) {
  const sections: PrintableCatalogGroup[] = groups && groups.length > 0 ? groups : [{ title: "", rows }];
  const isReceipt = sections.some((g) => g.rows.some((r) => Number(r.quantity ?? 0) > 0));
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const logo = await loadImageDataUrl(brand.logo_url);
  let grandUnits = 0;
  let grandSubtotal = 0;

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

    let startY = 60;
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
      startY += 5;
    }

    let units = 0;
    let subtotal = 0;
    const tableRows = section.rows
      .map((row) => {
        const pricing = computePricing({
          basePrice: Number(row.basePrice ?? 0),
          discountPercent: Number(row.discountPercent ?? 0),
          markupPercent: Number(row.markupPercent ?? 0),
        });
        const qty = Math.max(0, Math.floor(Number(row.quantity ?? 0)));
        if (isReceipt && qty <= 0) return null;
        const lineTotal = +(pricing.storeCost * qty).toFixed(2);
        units += qty;
        subtotal += lineTotal;
        return isReceipt
          ? [
              row.sku,
              row.name,
              row.category,
              money(pricing.basePrice),
              `${pricing.discountPercent}%`,
              money(pricing.storeCost),
              String(qty),
              money(lineTotal),
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
    grandSubtotal += subtotal;

    autoTable(doc, {
      startY,
      head: isReceipt
        ? [["SKU", "Product", "Category", "List", "Disc.", "Unit Cost", "Qty", "Line Total", "Markup", "Sugg. Retail"]]
        : [["SKU", "Product", "Category", "List", "Disc.", "Unit Cost", "Markup", "Sugg. Retail"]],
      body: tableRows,
      margin: { left: 14, right: 14, bottom: 24 },
      styles: { fontSize: 7.1, cellPadding: 1.7, textColor: [45, 45, 45], overflow: "linebreak" },
      headStyles: { fillColor: [17, 17, 17], textColor: 255, fontStyle: "bold", fontSize: 6.8 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: isReceipt
        ? {
            0: { cellWidth: 19 },
            1: { cellWidth: 34 },
            2: { cellWidth: 27 },
            3: { halign: "right", cellWidth: 17 },
            4: { halign: "right", cellWidth: 13 },
            5: { halign: "right", cellWidth: 18, fontStyle: "bold" },
            6: { halign: "right", cellWidth: 10 },
            7: { halign: "right", cellWidth: 20, fontStyle: "bold" },
            8: { halign: "right", cellWidth: 14, textColor: [100, 100, 100] },
            9: { halign: "right", cellWidth: 20, textColor: [100, 100, 100] },
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
    });

    if (isReceipt) {
      const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 20;
      const totalsY = Math.min(finalY + 10, pageHeight - 38);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(40);
      doc.text("Units", pageWidth - 78, totalsY);
      doc.text(String(units), pageWidth - 14, totalsY, { align: "right" });
      doc.setDrawColor(17);
      doc.line(pageWidth - 78, totalsY + 4, pageWidth - 14, totalsY + 4);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Subtotal", pageWidth - 78, totalsY + 11);
      doc.text(money(subtotal), pageWidth - 14, totalsY + 11, { align: "right" });
    }
  });

  if (isReceipt && sections.length > 1) {
    const finalY = (doc as any).lastAutoTable?.finalY ?? 70;
    const y = Math.min(finalY + 24, pageHeight - 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Total units (all deliveries)", pageWidth - 88, y);
    doc.text(String(grandUnits), pageWidth - 14, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text("Grand total", pageWidth - 88, y + 8);
    doc.text(money(grandSubtotal), pageWidth - 14, y + 8, { align: "right" });
  }

  const filename = isReceipt
    ? `${safeFilePart(store.name)}-order.pdf`
    : `${safeFilePart(store.name)}-pricing-sheet.pdf`;

  if (popup) {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    popup.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    doc.save(filename);
  }
}