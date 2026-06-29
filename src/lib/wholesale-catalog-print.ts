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

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function openPrintableCatalog({ brand, store, rows, groups }: PrintableCatalogInput) {
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const sections: PrintableCatalogGroup[] = groups && groups.length > 0 ? groups : [{ title: "", rows }];

  // Receipt mode if ANY row across any section has a positive quantity.
  const isReceipt = sections.some((g) => g.rows.some((r) => Number(r.quantity ?? 0) > 0));

  let allTimeUnits = 0;
  let allTimeSubtotal = 0;

  const renderSection = (group: PrintableCatalogGroup, idx: number): string => {
    let subtotal = 0;
    let units = 0;
    const tableRows = group.rows
      .map((r) => {
        const p = computePricing({
          basePrice: r.basePrice,
          discountPercent: r.discountPercent,
          markupPercent: r.markupPercent,
        });
        const qty = Math.max(0, Math.floor(Number(r.quantity ?? 0)));
        const lineTotal = +(p.storeCost * qty).toFixed(2);
        if (isReceipt) {
          subtotal += lineTotal;
          units += qty;
          if (qty <= 0) return "";
          return `
        <tr>
          <td>${escapeHtml(r.sku)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.category)}</td>
          <td class="num">$${r.basePrice.toFixed(2)}</td>
          <td class="num">${p.discountPercent}%</td>
          <td class="num strong">$${p.storeCost.toFixed(2)}</td>
          <td class="num">${qty}</td>
          <td class="num strong">$${lineTotal.toFixed(2)}</td>
          <td class="num muted">$${p.suggestedRetail.toFixed(2)}</td>
        </tr>`;
        }
        return `
        <tr>
          <td>${escapeHtml(r.sku)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.category)}</td>
          <td class="num">$${r.basePrice.toFixed(2)}</td>
          <td class="num">${p.discountPercent}%</td>
          <td class="num strong">$${p.storeCost.toFixed(2)}</td>
          <td class="num muted">$${p.suggestedRetail.toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    allTimeUnits += units;
    allTimeSubtotal += subtotal;

    const headerBlock = group.title
      ? `<div class="section-head">
           <div class="section-title">${escapeHtml(group.title)}</div>
           ${group.subtitle ? `<div class="section-sub">${escapeHtml(group.subtitle)}</div>` : ""}
         </div>`
      : "";

    return `
      <section class="delivery${idx > 0 ? " page-break" : ""}">
        ${headerBlock}
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Category</th>
              <th class="num">List</th>
              <th class="num">Disc.</th>
              <th class="num">Unit Cost</th>
              ${isReceipt ? `<th class="num">Qty</th><th class="num">Line Total</th><th class="num">Sugg. Retail</th>` : `<th class="num">Sugg. Retail</th>`}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        ${isReceipt ? `
        <div class="totals">
          <div class="totals-row"><span>Units</span><span class="num">${units}</span></div>
          <div class="totals-row grand"><span>Subtotal</span><span class="num">$${subtotal.toFixed(2)}</span></div>
        </div>` : ""}
      </section>`;
  };

  const sectionsHtml = sections.map(renderSection).join("");
  const grandUnits = allTimeUnits;
  const grandSubtotal = allTimeSubtotal;
  const showGrandTotals = isReceipt && sections.length > 1;

  const formatPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    // US/Canada: 11 digits starting with 1, or 10 digits
    if (digits.length === 11 && digits.startsWith("1")) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return raw.trim();
  };

  const phoneLines = (brand.contact_phone ?? "")
    .split(/[,;\n]/)
    .map((s) => formatPhone(s))
    .filter(Boolean);

  const brandLines = [
    { text: brand.address, nowrap: false },
    ...phoneLines.map((p) => ({ text: p, nowrap: true })),
    { text: brand.contact_email, nowrap: true },
    { text: brand.website, nowrap: true },
    { text: brand.instagram ? `@${brand.instagram.replace(/^@/, "")}` : null, nowrap: true },
  ]
    .filter((l) => !!l.text)
    .map(
      (l) =>
        `<div${l.nowrap ? ' style="white-space:nowrap"' : ""}>${escapeHtml(l.text!)}</div>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Wholesale Catalog — ${escapeHtml(store.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; color: #111; padding: 32px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 20px; }
  .brand { display: flex; gap: 14px; align-items: center; }
  .brand img { height: 56px; width: auto; object-fit: contain; }
  .brand-name { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
  .tagline { font-size: 11px; color: #666; margin-top: 2px; }
  .brand-info { font-size: 11px; color: #444; text-align: right; line-height: 1.5; }
  .doc-title { font-size: 18px; font-weight: 700; margin: 0 0 4px 0; }
  .meta { font-size: 12px; color: #555; margin-bottom: 18px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .meta .store { font-weight: 600; color: #111; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #111; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #eee; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 700; }
  .muted { color: #666; }
  .totals { margin-top: 16px; margin-left: auto; width: 280px; font-size: 12px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid #eee; }
  .totals-row.grand { font-size: 14px; font-weight: 700; border-bottom: none; border-top: 2px solid #111; margin-top: 4px; }
  footer { margin-top: 24px; font-size: 10px; color: #777; border-top: 1px solid #ddd; padding-top: 10px; display: flex; justify-content: space-between; gap: 16px; }
  .delivery { margin-bottom: 28px; }
  .delivery + .delivery { border-top: 1px dashed #999; padding-top: 18px; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 8px; }
  .section-title { font-size: 14px; font-weight: 700; color: #111; }
  .section-sub { font-size: 11px; color: #666; }
  .grand-totals { margin-top: 12px; margin-left: auto; width: 320px; font-size: 13px; border: 2px solid #111; padding: 8px 12px; }
  .grand-totals .grand { font-size: 15px; font-weight: 700; border-top: 1px solid #111; margin-top: 4px; padding-top: 6px; display: flex; justify-content: space-between; }
  .grand-totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
  @page { size: auto; margin: 0mm; }
  .print-bar { position: sticky; top: 0; z-index: 9999; background: #111; color: #fff; padding: 10px 14px; display: flex; gap: 8px; justify-content: flex-end; align-items: center; font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .print-bar .hint { margin-right: auto; font-size: 11px; opacity: 0.8; }
  .print-bar button { background: #fff; color: #111; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; }
  .print-bar button:active { opacity: 0.7; }
  @media print {
    html, body { margin: 0 !important; }
    body { padding: 14mm 12mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .page-break { page-break-before: always; }
    .print-bar { display: none !important; }
  }
</style>
</head>
<body>
  <div class="print-bar">
    <span class="hint">On iPhone: tap Print → pinch the preview → Share → Save to Files</span>
    <button onclick="window.print()">Print / Save PDF</button>
  </div>
  <header>
${sectionsHtml ? "" : ""}
${""}
${""}
${""}
${""}`;
  // Inject the rest of the body
  const bodyRest = `
    <div class="brand">
      ${brand.logo_url ? `<img src="${escapeHtml(brand.logo_url)}" alt="logo" />` : ""}
      <div>
        <div class="brand-name">${escapeHtml(brand.company_name || "")}</div>
        ${brand.tagline ? `<div class="tagline">${escapeHtml(brand.tagline)}</div>` : ""}
      </div>
    </div>
    <div class="brand-info">${brandLines}</div>
  </header>

  <h1 class="doc-title">${isReceipt ? "Wholesale Order · Supply Partnership" : "Wholesale Catalog · Supply Partnership"}</h1>
  <div class="meta">
    <div>
      <div class="store">For: ${escapeHtml(store.name)}</div>
      ${store.contact_name ? `<div>${escapeHtml(store.contact_name)}</div>` : ""}
      ${store.address ? `<div>${escapeHtml(store.address)}</div>` : ""}
    </div>
    <div>Date: ${escapeHtml(today)}</div>
  </div>

  ${sectionsHtml}

  ${showGrandTotals ? `
  <div class="grand-totals">
    <div class="row"><span>Total units (all deliveries)</span><span class="num">${grandUnits}</span></div>
    <div class="grand"><span>Grand total</span><span class="num">$${grandSubtotal.toFixed(2)}</span></div>
  </div>` : ""}
  <footer>
    <div>Prices in USD. Subject to change. ${escapeHtml(brand.company_name || "")} wholesale partnership.</div>
    <div>${escapeHtml(brand.website || "")}</div>
  </footer>

  <script>
    (function() {
      var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (!isMobile) {
        window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 300); });
      }
    })();
  </script>
</body>
</html>`;

  const finalHtml = html + bodyRest;

  // Use Blob URL so iOS Safari can Share → Save to Files from the rendered page.
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    const blob = new Blob([finalHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  // Desktop: ALWAYS use window.open — Safari compatibility (per project memory).
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(finalHtml);
  w.document.close();
}
