export const PARTNER_CATEGORY_NAME = "NÉRA x OhLaLa";
export const PARTNER_PAYOUT_SHARE = 0.6;

/**
 * Cost used for profit math. Partner products are free stock (cost_usd = 0),
 * but the partner earns 60% of the sale, so our clean profit is 40% of the selling price.
 */
export function profitCost(p: { category?: string | null; price_usd?: number | string | null; cost_usd?: number | string | null }): number {
  if (p.category === PARTNER_CATEGORY_NAME) return Number(p.price_usd ?? 0) * PARTNER_PAYOUT_SHARE;
  return Number(p.cost_usd ?? 0);
}
