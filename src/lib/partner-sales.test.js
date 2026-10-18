import { describe, expect, test } from "bun:test";
import { PARTNER_SALE_STATUSES } from "./partner-sales";

describe("partner sales", () => {
  test("includes saved manual Draft sales that have already reduced inventory", () => {
    const savedSales = [{ status: "Draft", quantity: 3, total: 45 }, { status: "Draft", quantity: 3, total: 58.8 }, { status: "Draft", quantity: 2, total: 43.8 }];
    const counted = savedSales.filter((s) => PARTNER_SALE_STATUSES.some((status) => status === s.status));
    expect(counted.reduce((sum, s) => sum + s.quantity, 0)).toBe(8);
    expect(counted.reduce((sum, s) => sum + s.total, 0)).toBeCloseTo(147.6, 2);
  });
});