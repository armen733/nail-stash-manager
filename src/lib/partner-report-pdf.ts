import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type ReportTable = { head: string[][]; body: string[][]; foot: string[][] };
export type PartnerReport = {
  title: string;
  date: string;
  contact: string;
  note: string;
  tables: ReportTable[];
};

// Only report text enters the PDF: no page address, anchors or browser footers.
export function createPartnerReportPdf(report: PartnerReport) {
  const pdf = new jsPDF({ orientation: "landscape", compress: true });
  pdf.setProperties({ title: report.title, author: "NÉRA Beauty" });
  pdf.setFontSize(15);
  pdf.text(report.title, 14, 34);
  pdf.setFontSize(9);
  pdf.text(report.date, 14, 41);
  pdf.text(report.contact, 283, 13, { align: "right" });
  let y = 47;
  report.tables.forEach((table, index) => {
    autoTable(pdf, {
      startY: y,
      head: table.head,
      body: table.body,
      foot: table.foot,
      showFoot: "lastPage",
      margin: 14,
      styles: { fontSize: 8, cellPadding: 2, minCellHeight: index === 0 ? 12 : 7 },
      theme: "plain",
      columnStyles: index === 0 ? { 0: { cellWidth: 14 } } : {},
      rowPageBreak: "avoid",
      headStyles: { fontStyle: "bold" },
      footStyles: { fontStyle: "bold" },
      didDrawPage: (data) => { y = (data.cursor?.y ?? y) + 8; },
    });
  });
  const lines = pdf.splitTextToSize(report.note, 269);
  if (y + lines.length * 5 > 196) { pdf.addPage(); y = 18; }
  pdf.setFontSize(9);
  pdf.text(lines, 14, y);
  return pdf;
}

export async function partnerReportPdfFromDocument(document: Document) {
  const report = document.querySelector<HTMLElement>(".report");
  if (!report) throw new Error("Report not ready");
  const text = (selector: string) => report.querySelector<HTMLElement>(selector)?.innerText ?? "";
  const tables = Array.from(report.querySelectorAll("table")).map((table) => {
    const rows = (selector: string) => Array.from(table.querySelectorAll<HTMLTableRowElement>(selector))
      .map((row) => Array.from(row.cells).map((cell) => cell.innerText));
    return { head: rows("thead tr"), body: rows("tbody tr"), foot: rows("tfoot tr") };
  });
  const pdf = createPartnerReportPdf({ title: text("h1"), date: text("h1 + p"), contact: text(".contact"), note: text(".note"), tables });
  // Embed copies of the existing report photos, never their source URLs.
  const images = Array.from(report.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(images.map(async (image) => {
    try {
      const response = await fetch(image.src);
      if (!response.ok) return;
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) { bitmap.close(); return; }
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      image.dataset.pdfImage = canvas.toDataURL("image/png");
    } catch { /* Keep the report available if a remote photo cannot be embedded. */ }
  }));
  // Re-render tables with the embedded photos at their actual paginated positions.
  const photoPdf = new jsPDF({ orientation: "landscape", compress: true });
  photoPdf.setProperties({ title: text("h1"), author: "NÉRA Beauty" });
  photoPdf.setFontSize(15); photoPdf.text(text("h1"), 14, 34);
  photoPdf.setFontSize(9); photoPdf.text(text("h1 + p"), 14, 41);
  photoPdf.text(text(".contact"), 283, 13, { align: "right" });
  const logo = report.querySelector<HTMLImageElement>(".top img");
  if (logo?.dataset.pdfImage) {
    const ratio = logo.naturalWidth / (logo.naturalHeight || 1);
    const height = Math.min(19, 45 / (ratio || 1));
    photoPdf.addImage(logo.dataset.pdfImage, "PNG", 14, 8, height * ratio, height);
  }
  let y = 47;
  const productImages = Array.from(report.querySelectorAll<HTMLTableRowElement>("table:first-of-type tbody tr"))
    .map((row) => row.querySelector<HTMLImageElement>("img")?.dataset.pdfImage);
  tables.forEach((table, index) => {
    autoTable(photoPdf, {
      startY: y, head: table.head, body: table.body, foot: table.foot,
      showFoot: "lastPage", margin: 14, theme: "plain", rowPageBreak: "avoid",
      styles: { fontSize: 8, cellPadding: 2, minCellHeight: index === 0 ? 12 : 7 },
      columnStyles: index === 0 ? { 0: { cellWidth: 14 } } : {},
      headStyles: { fontStyle: "bold" }, footStyles: { fontStyle: "bold" },
      didDrawCell: (data) => {
        const image = productImages[data.row.index];
        if (index === 0 && data.section === "body" && data.column.index === 0 && image) {
          photoPdf.addImage(image, "PNG", data.cell.x + 1, data.cell.y + 1, 10, 10);
        }
      },
      didDrawPage: (data) => { y = (data.cursor?.y ?? y) + 8; },
    });
  });
  const note = photoPdf.splitTextToSize(text(".note"), 269);
  if (y + note.length * 5 > 196) { photoPdf.addPage(); y = 18; }
  photoPdf.setFontSize(9); photoPdf.text(note, 14, y);
  // Keep the pure text path useful for environments without canvas images.
  return images.some((image) => image.dataset.pdfImage) ? photoPdf : pdf;
}