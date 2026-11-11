import { expect, test } from "bun:test";
import { PAID_TAG_HTML, paidBannerHtml, paidNoteHtml, paidReportText } from "./partner-paid";

const paid = {
  partnerName: "OhLaLa",
  paidAmount: 352.5,
  paidOn: "2026-11-11T20:31:18.000Z",
  unitsSold: 38,
  totalSales: 587.5,
  ourShare: 235,
  ourPct: 0.4,
  theirPct: 0.6,
};

test("a settled sheet states the amount paid and that nothing further is owed", () => {
  const text = paidReportText(paid);
  expect(text.startsWith("PAID")).toBe(true);
  expect(text).toContain("OhLaLa received $352.50");
  expect(text).toContain("38 units sold");
  expect(text).toContain("NÉRA kept $235.00 (40%)");
  expect(text).toContain("Nothing further is owed");
});

test("the paid banner marks the sheet as settled with the paid amount", () => {
  const html = paidBannerHtml(paid);
  expect(html).toContain('class="paid"');
  expect(html).toContain("PAID");
  expect(html).toContain("OhLaLa was paid $352.50");
  expect(html).toContain("These sales are settled");
});

test("paid wording never carries a page address or private link", () => {
  const html = `${paidBannerHtml(paid)}${PAID_TAG_HTML}${paidNoteHtml(paid)}`;
  expect(html).not.toContain("http");
  expect(html).not.toContain("warehouse/");
  expect(html).not.toContain("<a ");
});
