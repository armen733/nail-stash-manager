import { NERA_PACKING_LOGO } from "./packingLogo";
import type { ReceiptOrder } from "./order-receipt-pdf";

const statusColors: Record<string, { text: string; fill: string }> = {
  Draft: { text: "#92400e", fill: "#fef3c7" },
  Confirmed: { text: "#1e40af", fill: "#dbeafe" },
  Shipped: { text: "#7c3aed", fill: "#e9d5ff" },
  Delivered: { text: "#065f46", fill: "#d1fae5" },
  Paid: { text: "#065f46", fill: "#d1fae5" },
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Renders the order receipt to a PNG blob so it can be saved to the
 * phone's photo library via the native share sheet.
 */
export async function generateOrderReceiptImage(order: ReceiptOrder): Promise<Blob> {
  const W = 750; // logical width
  const PAD = 48;
  const orderNo = order.id.slice(0, 8).toUpperCase();
  const dateStr = new Date(order.order_date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const shipName = order.salons?.name || order.customer_name || "—";
  const shipAddress = order.customer_address || "";

  const logo = await loadImage(NERA_PACKING_LOGO);

  // First pass: measure height with a throwaway context
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = "16px Helvetica, Arial, sans-serif";

  const addressLines = shipAddress ? wrapText(measure, shipAddress, 340) : [];
  const itemRows = (order.order_items || []).map((item) => {
    const nameLines = wrapText(measure, item.products?.name || "Unknown", 330);
    return { item, nameLines, sku: item.products?.sku || "" };
  });
  const noteLines = order.notes ? wrapText(measure, order.notes, W - PAD * 2 - 32) : [];

  const totals: { label: string; value: string; bold?: boolean; green?: boolean }[] = [
    { label: "Subtotal", value: `$${order.subtotal.toFixed(2)}` },
  ];
  if ((order.discount_amount ?? 0) > 0) {
    totals.push({
      label: `Discount${order.discount_code ? ` (${order.discount_code})` : ""}`,
      value: `-$${Number(order.discount_amount).toFixed(2)}`,
      green: true,
    });
  }
  if ((order.points_redeemed ?? 0) > 0) {
    totals.push({ label: `Points Redeemed (${order.points_redeemed} pts)`, value: "", green: true });
  }
  totals.push({ label: "Tax", value: `$${order.tax.toFixed(2)}` });
  {
    const rawZone = (order.shipping_zone ?? "").trim();
    const zone = /enter address/i.test(rawZone) ? "" : rawZone;
    const amt = order.shipping ?? 0;
    totals.push({
      label: `Shipping${zone ? ` (${zone})` : ""}`,
      value: amt > 0 ? `$${amt.toFixed(2)}` : "FREE",
    });
  }
  totals.push({ label: "Total", value: `$${order.total.toFixed(2)}`, bold: true });

  // Height calculation
  let h = PAD; // top
  h += 90; // header (logo + order info)
  h += 24; // divider gap
  h += 24; // "SHIP TO"
  h += 26; // name
  h += addressLines.length * 22;
  h += 24; // gap before table
  h += 40; // table header
  itemRows.forEach((r) => {
    h += r.nameLines.length * 22 + (r.sku ? 20 : 0) + 16;
  });
  h += 16; // gap after table
  h += totals.length * 30 + 16; // totals
  if (noteLines.length) h += 24 + noteLines.length * 22 + 32;
  h += 60; // footer
  h += PAD; // bottom

  const SCALE = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, h);

  let y = PAD;

  // Logo
  if (logo) {
    const logoH = 64;
    const logoW = (logo.width / logo.height) * logoH;
    ctx.drawImage(logo, PAD, y, logoW, logoH);
  } else {
    ctx.fillStyle = "#111111";
    ctx.font = "bold 32px Helvetica, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("NÉRA Beauty", PAD, y + 40);
  }

  // Order info (right)
  ctx.textAlign = "right";
  ctx.fillStyle = "#666666";
  ctx.font = "16px Helvetica, Arial, sans-serif";
  ctx.fillText(`Order #${orderNo}`, W - PAD, y + 20);
  ctx.fillText(dateStr, W - PAD, y + 42);

  // Status badge
  const sc = statusColors[order.status] || { text: "#444444", fill: "#f0f0f0" };
  ctx.font = "bold 14px Helvetica, Arial, sans-serif";
  const badgeW = ctx.measureText(order.status).width + 24;
  const badgeH = 26;
  const badgeX = W - PAD - badgeW;
  const badgeY = y + 54;
  ctx.fillStyle = sc.fill;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
  ctx.fill();
  ctx.fillStyle = sc.text;
  ctx.fillText(order.status, W - PAD - badgeW / 2, badgeY + 18);

  y += 90;

  // Divider
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += 24;

  // Ship To
  ctx.textAlign = "left";
  ctx.fillStyle = "#666666";
  ctx.font = "bold 16px Helvetica, Arial, sans-serif";
  ctx.fillText("SHIP TO", PAD, y);
  y += 26;
  ctx.fillStyle = "#111111";
  ctx.fillText(shipName, PAD, y);
  y += 24;
  if (addressLines.length) {
    ctx.font = "16px Helvetica, Arial, sans-serif";
    ctx.fillStyle = "#3c3c3c";
    addressLines.forEach((line) => {
      ctx.fillText(line, PAD, y);
      y += 22;
    });
  }
  y += 24;

  // Table header
  const colQty = W - PAD - 220;
  const colPrice = W - PAD - 120;
  const colTotal = W - PAD;
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(PAD, y - 18, W - PAD * 2, 40);
  ctx.fillStyle = "#111111";
  ctx.font = "bold 15px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Product", PAD + 12, y + 8);
  ctx.textAlign = "center";
  ctx.fillText("Qty", colQty, y + 8);
  ctx.textAlign = "right";
  ctx.fillText("Price", colPrice, y + 8);
  ctx.fillText("Total", colTotal, y + 8);
  y += 40;

  // Table rows
  itemRows.forEach(({ item, nameLines, sku }, idx) => {
    const rowH = nameLines.length * 22 + (sku ? 20 : 0) + 16;
    if (idx % 2 === 0) {
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(PAD, y - 6, W - PAD * 2, rowH);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#2d2d2d";
    ctx.font = "15px Helvetica, Arial, sans-serif";
    nameLines.forEach((line, i) => {
      ctx.fillText(line, PAD + 12, y + 14 + i * 22);
    });
    if (sku) {
      ctx.fillStyle = "#999999";
      ctx.font = "13px Helvetica, Arial, sans-serif";
      ctx.fillText(sku, PAD + 12, y + 14 + nameLines.length * 22);
    }
    ctx.fillStyle = "#2d2d2d";
    ctx.font = "15px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(item.quantity), colQty, y + 14);
    ctx.textAlign = "right";
    ctx.fillText(`$${item.unit_price.toFixed(2)}`, colPrice, y + 14);
    ctx.fillText(`$${(item.quantity * item.unit_price).toFixed(2)}`, colTotal, y + 14);
    y += rowH;
  });
  y += 16;

  // Totals (right aligned block)
  const totalsLabelX = W - PAD - 280;
  totals.forEach((t, idx) => {
    if (t.bold) {
      ctx.font = "bold 19px Helvetica, Arial, sans-serif";
      ctx.fillStyle = "#111111";
    } else if (t.green) {
      ctx.font = "bold 15px Helvetica, Arial, sans-serif";
      ctx.fillStyle = "#059669";
    } else {
      ctx.font = "15px Helvetica, Arial, sans-serif";
      ctx.fillStyle = "#3c3c3c";
    }
    ctx.textAlign = "left";
    ctx.fillText(t.label, totalsLabelX, y);
    ctx.textAlign = "right";
    ctx.fillText(t.value, W - PAD, y);
    if (idx === totals.length - 2) {
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(totalsLabelX, y + 8);
      ctx.lineTo(W - PAD, y + 8);
      ctx.stroke();
    }
    y += 30;
  });
  y += 16;

  // Notes
  if (noteLines.length) {
    const boxH = 24 + noteLines.length * 22 + 16;
    ctx.fillStyle = "#f9f9f9";
    ctx.beginPath();
    ctx.roundRect(PAD, y, W - PAD * 2, boxH, 8);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#666666";
    ctx.font = "bold 15px Helvetica, Arial, sans-serif";
    ctx.fillText("Notes", PAD + 16, y + 26);
    ctx.font = "15px Helvetica, Arial, sans-serif";
    ctx.fillStyle = "#3c3c3c";
    noteLines.forEach((line, i) => {
      ctx.fillText(line, PAD + 16, y + 50 + i * 22);
    });
    y += boxH + 16;
  }

  // Footer
  ctx.textAlign = "center";
  ctx.fillStyle = "#999999";
  ctx.font = "14px Helvetica, Arial, sans-serif";
  ctx.fillText("Thank you for your business!", W / 2, h - PAD + 10);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to render receipt image"));
    }, "image/png");
  });
}
