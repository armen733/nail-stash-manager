// Pricing helpers for the Supply Stores feature.
// "Our wholesale price" = product.wholesale_price_usd (fallback to price_usd).
// "Discount %" = the discount we give the supply store off our wholesale price.
// "Markup %" = suggested resale markup the store applies on top of what they paid us.

export interface PricingInputs {
  basePrice: number; // our wholesale price for this product
  discountPercent: number; // how much we shave off (e.g. 20 = 20% off)
  markupPercent: number; // how much they should mark up over their cost (e.g. 50 = +50%)
}

export interface PricingResult {
  basePrice: number;
  discountPercent: number;
  markupPercent: number;
  storeCost: number; // what they pay us
  suggestedRetail: number; // what we recommend they sell at
  storeMargin: number; // suggestedRetail - storeCost
}

export function computePricing(inputs: PricingInputs): PricingResult {
  const basePrice = Math.max(0, Number(inputs.basePrice) || 0);
  const discountPercent = Math.max(0, Math.min(100, Number(inputs.discountPercent) || 0));
  const markupPercent = Math.max(0, Number(inputs.markupPercent) || 0);
  const storeCost = +(basePrice * (1 - discountPercent / 100)).toFixed(2);
  // Suggested retail is markup on our LIST price (not on the discounted store cost),
  // so the store sees the markup applied to our regular selling price.
  const suggestedRetail = +(basePrice * (1 + markupPercent / 100)).toFixed(2);
  const storeMargin = +(suggestedRetail - storeCost).toFixed(2);
  return { basePrice, discountPercent, markupPercent, storeCost, suggestedRetail, storeMargin };
}

export function effectiveDiscount(
  storeDefault: number | null | undefined,
  override: number | null | undefined,
): number {
  if (override !== null && override !== undefined) return Number(override);
  return Number(storeDefault ?? 0);
}

export function effectiveMarkup(
  storeDefault: number | null | undefined,
  override: number | null | undefined,
): number {
  if (override !== null && override !== undefined) return Number(override);
  return Number(storeDefault ?? 0);
}
