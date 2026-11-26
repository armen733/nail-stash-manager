import { PARTNER_CATEGORY_NAME } from "@/lib/partner-cost";

export interface BulkDiscountProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  price_usd: number;
}

export function calculateSalePrice(price: number, discountPercent: number): number {
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}

export function getBulkDiscountTargets<T extends { category: string }>(
  products: T[],
  categories: string[],
): T[] {
  const selected = new Set(categories);
  return products.filter(
    (product) =>
      product.category !== PARTNER_CATEGORY_NAME &&
      (selected.size === 0 || selected.has(product.category)),
  );
}

export function shouldRestoreOriginalPrice(currentPrice: number, salePrice: number): boolean {
  return Math.abs(currentPrice - salePrice) < 0.005;
}
