import { downloadCSV } from "./csv-export";
import { computePricing } from "./wholesale-pricing";

export interface WholesaleCatalogRow {
  sku: string;
  name: string;
  category: string;
  basePrice: number;
  discountPercent: number;
  markupPercent: number;
}

export function exportWholesaleCatalog(storeName: string, rows: WholesaleCatalogRow[]) {
  const data = rows.map((r) => {
    const p = computePricing({
      basePrice: r.basePrice,
      discountPercent: r.discountPercent,
      markupPercent: r.markupPercent,
    });
    return {
      SKU: r.sku,
      Name: r.name,
      Category: r.category,
      "Wholesale Price (USD)": r.basePrice.toFixed(2),
      "Discount %": p.discountPercent,
      "Your Cost (USD)": p.storeCost.toFixed(2),
      "Markup %": p.markupPercent,
      "Suggested Retail (USD)": p.suggestedRetail.toFixed(2),
      "Your Margin (USD)": p.storeMargin.toFixed(2),
    };
  });
  const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "store";
  downloadCSV(data, `wholesale-catalog-${slug}`);
}
