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

export interface PrintableCatalogInput {
  brand: CompanyBrand;
  store: { name: string; contact_name: string | null; phone: string | null; email: string | null; address: string | null };
  rows: PrintableRow[];
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function openPrintableCatalog({ brand, store, rows }: PrintableCatalogInput) {
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  // If any row has a positive quantity, render as an order receipt
  const isReceipt = rows.some((r) => Number(r.quantity ?? 0) > 0);

  let grandSubtotal = 0;
  let grandUnits = 0;

  const tableRows = rows
    .map((r) => {
      const p = computePricing({
        basePrice: r.basePrice,
        discountPercent: r.discountPercent,
        markupPercent: r.markupPercent,
      });
      const qty = Math.max(0, Math.floor(Number(r.quantity ?? 0)));
      const lineTotal = +(p.storeCost * qty).toFixed(2);
      if (isReceipt) {
        grandSubtotal += lineTotal;
        grandUnits += qty;
      }
      if (isReceipt) {
        // Skip rows with zero quantity in receipt mode
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
  @media print {
    body { padding: 16mm; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <header>
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

  <table>
    <thead>
      <tr>
        <th>SKU</th>
        <th>Product</th>
        <th>Category</th>
        <th class="num">List</th>
        <th class="num">Disc.</th>
        <th class="num">Unit Cost</th>
        ${isReceipt ? `<th class="num">Qty</th><th class="num">Line Total</th>` : `<th class="num">Sugg. Retail</th>`}
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  ${isReceipt ? `
  <div class="totals">
    <div class="totals-row"><span>Total units</span><span class="num">${grandUnits}</span></div>
    <div class="totals-row grand"><span>Order total</span><span class="num">$${grandSubtotal.toFixed(2)}</span></div>
  </div>` : ""}
  <footer>
    <div>Prices in USD. Subject to change. ${escapeHtml(brand.company_name || "")} wholesale partnership.</div>
    <div>${escapeHtml(brand.website || "")}</div>
  </footer>

  <script>
    window.addEventListener('load', () => { setTimeout(() => window.print(), 300); });
  </script>
</body>
</html>`;

  // ALWAYS use window.open — Safari compatibility (per project memory).
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
