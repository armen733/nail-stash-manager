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

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);

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
  const isMobile =
    (/Android|iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) &&
    !(window as any).MSStream;

  void createWholesalePdf({ brand, store, rows, groups, deliveryMode: isMobile ? "share" : "save" }).catch((error) => {
    console.error("Failed to create wholesale PDF", error);
  });
}

const toastUnavailablePopup = () => {
  // Keep this dependency-free because this utility is used from several pages.
  alert("Please allow pop-ups for this app, then try printing again.");
};

async function createMobilePrintablePage({
  brand,
  store,
  rows,
  groups,
  popup,
}: PrintableCatalogInput & { popup: Window }) {
  const sections: PrintableCatalogGroup[] = groups && groups.length > 0 ? groups : [{ title: "", rows }];
  const isReceipt = sections.some((g) => g.rows.some((r) => Number(r.quantity ?? 0) > 0));
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const logo = await loadImageDataUrl(brand.logo_url);
  const phoneLines = (brand.contact_phone ?? "")
    .split(/[,;\n]/)
    .map((s) => formatPhone(s))
    .filter(Boolean);
  const contactLines = [...phoneLines, brand.contact_email, brand.website].filter(Boolean) as string[];
  let grandUnits = 0;
  let grandSubtotal = 0;

  const sectionHtml = sections
    .map((section, sectionIndex) => {
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
          if (isReceipt && qty <= 0) return "";
          const lineTotal = +(pricing.storeCost * qty).toFixed(2);
          units += qty;
          subtotal += lineTotal;
          return isReceipt
            ? `<tr>
                <td>${escapeHtml(row.sku)}</td>
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.category)}</td>
                <td class="num">${money(pricing.basePrice)}</td>
                <td class="num">${pricing.discountPercent}%</td>
                <td class="num strong">${money(pricing.storeCost)}</td>
                <td class="num">${qty}</td>
                <td class="num strong">${money(lineTotal)}</td>
                <td class="num muted">${pricing.markupPercent}%</td>
                <td class="num muted">${money(pricing.suggestedRetail)}</td>
              </tr>`
            : `<tr>
                <td>${escapeHtml(row.sku)}</td>
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.category)}</td>
                <td class="num">${money(pricing.basePrice)}</td>
                <td class="num">${pricing.discountPercent}%</td>
                <td class="num strong">${money(pricing.storeCost)}</td>
                <td class="num muted">${pricing.markupPercent}%</td>
                <td class="num muted">${money(pricing.suggestedRetail)}</td>
              </tr>`;
        })
        .join("");

      grandUnits += units;
      grandSubtotal += subtotal;

      return `<section class="paper ${sectionIndex > 0 ? "new-page" : ""}">
        <header class="doc-header">
          <div class="brand-block">
            ${logo ? `<img src="${logo}" alt="${escapeHtml(brand.company_name || "NÉRA Beauty")}" />` : ""}
            <div>
              <h1>${escapeHtml(brand.company_name || "NÉRA Beauty")}</h1>
              ${brand.tagline ? `<p>${escapeHtml(brand.tagline)}</p>` : ""}
            </div>
          </div>
          <div class="contact-lines">
            ${contactLines
              .slice(0, 4)
              .map((line) => `<div>${escapeHtml(line)}</div>`)
              .join("")}
          </div>
        </header>

        <div class="rule"></div>

        <div class="title-row">
          <div>
            <h2>${isReceipt ? "Wholesale Order · Supply Partnership" : "Wholesale Catalog · Supply Partnership"}</h2>
            <h3>For: ${escapeHtml(store.name)}</h3>
            ${store.contact_name ? `<p>${escapeHtml(store.contact_name)}</p>` : ""}
            ${store.address ? `<p>${escapeHtml(store.address)}</p>` : ""}
          </div>
          <p>Date: ${escapeHtml(today)}</p>
        </div>

        ${
          section.title
            ? `<div class="section-title"><strong>${escapeHtml(section.title)}</strong>${section.subtitle ? `<span>${escapeHtml(section.subtitle)}</span>` : ""}</div>`
            : ""
        }

        <table class="${isReceipt ? "receipt" : "catalog"}">
          <thead>
            <tr>
              ${
                isReceipt
                  ? "<th>SKU</th><th>Product</th><th>Category</th><th>List</th><th>Disc.</th><th>Cost</th><th>Qty</th><th>Total</th><th>Markup %</th><th>Retail</th>"
                  : "<th>SKU</th><th>Product</th><th>Category</th><th>List</th><th>Disc.</th><th>Cost</th><th>Markup %</th><th>Retail</th>"
              }
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>

        ${
          isReceipt
            ? `<div class="totals">
                <div><span>Units</span><strong>${units}</strong></div>
                <div class="grand"><span>Total</span><strong>${money(subtotal)}</strong></div>
              </div>`
            : ""
        }

        ${
          isReceipt && sections.length > 1 && sectionIndex === sections.length - 1
            ? `<div class="grand-totals"><div><span>Total units (all deliveries)</span><strong>${grandUnits}</strong></div><div><span>Grand total</span><strong>${money(grandSubtotal)}</strong></div></div>`
            : ""
        }

        <footer>Prices in USD. Subject to change. ${escapeHtml(brand.company_name || "NÉRA Beauty")} wholesale partnership.</footer>
      </section>`;
    })
    .join("");

  popup.document.open();
  popup.document.write(`<!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(isReceipt ? `${store.name} order` : `${store.name} pricing sheet`)}</title>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; min-height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111; color: #111; }
          .toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 10px; padding: 10px; background: #111; box-shadow: 0 2px 14px rgba(0,0,0,.28); }
          .toolbar button { flex: 1; border: 0; border-radius: 8px; min-height: 46px; font: 700 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .toolbar .back { background: #2f2f2f; color: #fff; }
          .toolbar .print { background: #fff; color: #111; }
          .preview { padding: 12px 10px 28px; }
          .paper { position: relative; width: 216mm; min-height: 279mm; max-width: 100%; margin: 0 auto 14px; padding: 15mm 14mm 20mm; background: #fff; overflow: hidden; }
          .doc-header { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
          .brand-block { display: flex; align-items: center; gap: 10px; min-width: 0; }
          .brand-block img { width: 14mm; height: 14mm; object-fit: contain; flex: 0 0 auto; }
          h1 { margin: 0; font-size: 18px; line-height: 1.15; }
          h2 { margin: 0 0 5px; font-size: 13px; line-height: 1.25; }
          h3 { margin: 0 0 3px; font-size: 10px; line-height: 1.25; }
          p { margin: 0 0 2px; font-size: 9px; line-height: 1.35; color: #666; }
          .contact-lines { text-align: right; font-size: 8px; line-height: 1.35; color: #444; white-space: nowrap; }
          .rule { height: 0; border-top: 1.4px solid #111; margin: 7mm 0 5mm; }
          .title-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 5mm; }
          .title-row > div { min-width: 0; }
          .section-title { display: flex; justify-content: space-between; gap: 10px; margin: 0 0 4mm; font-size: 10px; }
          .section-title span { color: #666; font-size: 9px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 6.5px; }
          th { background: #111; color: #fff; text-align: left; padding: 3px 4px; font-weight: 700; }
          td { padding: 4px 4px; border-bottom: 1px solid #eee; vertical-align: top; overflow-wrap: anywhere; }
          tbody tr:nth-child(odd) td { background: #f8f8f8; }
          /* Receipt: 10 columns */
          .receipt th:nth-child(1), .receipt td:nth-child(1) { width: 9%; }
          .receipt th:nth-child(2), .receipt td:nth-child(2) { width: 14%; }
          .receipt th:nth-child(3), .receipt td:nth-child(3) { width: 13%; }
          .receipt th:nth-child(4), .receipt td:nth-child(4) { width: 9%; }
          .receipt th:nth-child(5), .receipt td:nth-child(5) { width: 7%; }
          .receipt th:nth-child(6), .receipt td:nth-child(6) { width: 9%; }
          .receipt th:nth-child(7), .receipt td:nth-child(7) { width: 5%; }
          .receipt th:nth-child(8), .receipt td:nth-child(8) { width: 11%; }
          .receipt th:nth-child(9), .receipt td:nth-child(9) { width: 12%; }
          .receipt th:nth-child(10), .receipt td:nth-child(10) { width: 11%; }
          /* Catalog: 8 columns */
          .catalog th:nth-child(1), .catalog td:nth-child(1) { width: 12%; }
          .catalog th:nth-child(2), .catalog td:nth-child(2) { width: 28%; }
          .catalog th:nth-child(3), .catalog td:nth-child(3) { width: 18%; }
          .catalog th:nth-child(4), .catalog td:nth-child(4) { width: 10%; }
          .catalog th:nth-child(5), .catalog td:nth-child(5) { width: 8%; }
          .catalog th:nth-child(6), .catalog td:nth-child(6) { width: 11%; }
          .catalog th:nth-child(7), .catalog td:nth-child(7) { width: 7%; }
          .catalog th:nth-child(8), .catalog td:nth-child(8) { width: 6%; }
          .num { text-align: right; white-space: nowrap; }
          .strong { font-weight: 700; }
          .muted { color: #666; }
          .totals, .grand-totals { width: 34%; min-width: 54mm; margin: 10mm 0 0 auto; font-size: 10px; }
          .totals div, .grand-totals div { display: flex; justify-content: space-between; gap: 12px; padding: 4px 6px; background: #f7f7f7; }
          .totals .grand, .grand-totals div:last-child { margin-top: 4px; border-top: 1.2px solid #111; background: #fff; font-size: 12px; }
          footer { position: absolute; left: 14mm; right: 14mm; bottom: 12mm; border-top: 1px solid #ddd; padding-top: 4mm; font-size: 8px; color: #777; }
          @media screen and (max-width: 720px) {
            .paper { transform-origin: top center; font-size: 1px; }
          }
          @page { size: letter; margin: 0; }
          @media print {
            html, body { background: #fff; }
            .toolbar { display: none !important; }
            .preview { padding: 0; }
            .paper { width: 216mm; min-height: 279mm; max-width: none; margin: 0; box-shadow: none; page-break-after: always; }
            .paper:last-child { page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button class="back" type="button" id="backBtn">Back to app</button>
          <button class="print" type="button" id="printBtn">Print / Save</button>
        </div>
        <main class="preview">${sectionHtml}</main>
        <script>
          document.getElementById('backBtn').addEventListener('click', function () {
            if (window.opener) window.close();
            else history.back();
          });
          document.getElementById('printBtn').addEventListener('click', function () { window.print(); });
        </script>
      </body>
    </html>`);
  popup.document.close();
}

async function createWholesalePdf({
  brand,
  store,
  rows,
  groups,
  deliveryMode = "save",
}: PrintableCatalogInput & { deliveryMode?: "save" | "share" }) {
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

    if (isReceipt) {
      const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 20;
      const totalsY = finalY + 12 > pageHeight - 42 ? pageHeight - 42 : finalY + 12;
      const boxX = pageWidth - 82;
      const boxW = 68;
      doc.setFillColor(248, 248, 248);
      doc.rect(boxX, totalsY - 5.5, boxW, 11, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(40);
      doc.text("Units", boxX + 2, totalsY);
      doc.text(String(units), boxX + boxW - 2, totalsY, { align: "right" });
      doc.setDrawColor(17);
      doc.setLineWidth(0.35);
      doc.line(boxX, totalsY + 5.5, boxX + boxW, totalsY + 5.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Total", boxX + 2, totalsY + 13);
      doc.text(money(subtotal), boxX + boxW - 2, totalsY + 13, { align: "right" });
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