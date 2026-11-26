import { describe, expect, test } from "bun:test";
import {
  calculateSalePrice,
  getBulkDiscountTargets,
  shouldRestoreOriginalPrice,
} from "./bulk-product-discount";

const products = [
  { id: "bit", category: "Nail Drill Bits", price_usd: 10 },
  { id: "brush", category: "Brushes", price_usd: 20 },
  { id: "partner", category: "NÉRA x OhLaLa", price_usd: 15 },
];

describe("bulk product discounts", () => {
  test("rounds automatic sale prices to cents", () => {
    expect(calculateSalePrice(19.99, 15)).toBe(16.99);
    expect(calculateSalePrice(10, 30)).toBe(7);
  });

  test("targets all regular products when no category is selected", () => {
    expect(getBulkDiscountTargets(products, []).map((p) => p.id)).toEqual(["bit", "brush"]);
  });

  test("targets only selected categories", () => {
    expect(getBulkDiscountTargets(products, ["Brushes"]).map((p) => p.id)).toEqual(["brush"]);
  });

  test("excludes OhLaLa even when its category is explicitly selected", () => {
    expect(getBulkDiscountTargets(products, ["NÉRA x OhLaLa"])).toEqual([]);
  });

  test("restores only a price that still matches the sale price", () => {
    expect(shouldRestoreOriginalPrice(7, 7)).toBe(true);
    expect(shouldRestoreOriginalPrice(8, 7)).toBe(false);
  });
});
