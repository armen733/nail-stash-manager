import { expect, test } from "bun:test";
import { createPartnerReportPdf } from "./partner-report-pdf";

test("partner PDFs cannot include the browser location or clickable admin links", () => {
  const previous = globalThis.location;
  globalThis.location = { href: "https://private-admin.example/warehouse/private-id" };
  try {
    const pdf = createPartnerReportPdf({ title: "Partner report", date: "2026-10-24", contact: "NÉRA Beauty", note: "", tables: [{ head: [["SKU", "Stock"]], body: [["SKU-1", "5"]], foot: [] }] });
    const output = pdf.output();
    expect(output.startsWith("%PDF-")).toBe(true);
    expect(output).not.toContain("private-admin.example");
    expect(output).not.toContain("/URI");
    expect(output).not.toContain("/Annots");
  } finally { globalThis.location = previous; }
});