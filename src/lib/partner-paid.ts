// Paid-report wording for partner sheets: a settled period must read as PAID on
// screen, on paper and inside the generated PDF, so the partner never wonders
// whether the money already went out.

export type PartnerPaidInfo = {
  partnerName: string;
  paidAmount: number;
  paidOn: string;
  unitsSold: number;
  totalSales: number;
  ourShare: number;
  ourPct: number;
  theirPct: number;
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const esc = (t: any) =>
  String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));

export const paidDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "long" });

/** Plain-text version used inside the generated PDF. */
export function paidReportText(i: PartnerPaidInfo) {
  return `PAID — ${i.partnerName} received ${money(i.paidAmount)} on ${paidDate(i.paidOn)} for ${i.unitsSold} units sold (${money(i.totalSales)}). NÉRA kept ${money(i.ourShare)} (${pct(i.ourPct)}). Nothing further is owed for these sales.`;
}

/** Highlighted banner shown at the top of a settled sheet. */
export function paidBannerHtml(i: PartnerPaidInfo) {
  return `<div class="paid"><span class="tick">PAID</span><div><b>${esc(i.partnerName)} was paid ${money(i.paidAmount)} on ${esc(paidDate(i.paidOn))}</b><br>${i.unitsSold} units sold · ${money(i.totalSales)} in sales · NÉRA kept ${money(i.ourShare)} (${pct(i.ourPct)}) · ${esc(i.partnerName)} received ${money(i.paidAmount)} (${pct(i.theirPct)}). These sales are settled — nothing further is owed for them.</div></div>`;
}

/** Small marker used next to a paid total inside the summary table. */
export const PAID_TAG_HTML = `<span class="paidtag">PAID</span>`;

/** Closing line for a settled sheet. */
export function paidNoteHtml(i: PartnerPaidInfo) {
  return ` &nbsp;·&nbsp; <b>${esc(i.partnerName)} was already paid ${money(i.paidAmount)} on ${esc(paidDate(i.paidOn))}</b> for these sales.`;
}
