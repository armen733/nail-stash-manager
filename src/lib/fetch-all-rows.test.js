import { describe, expect, test } from "bun:test";
import { fetchAllRows } from "./fetch-all-rows";

describe("complete statistics pagination", () => {
  test("includes sales beyond the 1,000-row boundary", async () => {
    const sales = Array.from({ length: 1019 }, (_, id) => ({ id, revenue: id >= 1000 ? 10 : 1 }));
    const calls = [];
    const result = await fetchAllRows(async (from, to) => {
      calls.push([from, to]);
      return { data: sales.slice(from, to + 1), error: null };
    });
    expect(result.data).toHaveLength(1019);
    expect(result.data.reduce((sum, sale) => sum + sale.revenue, 0)).toBe(1190);
    expect(calls).toEqual([[0, 999], [1000, 1999]]);
  });

  test("reads the terminal page for an exact multiple", async () => {
    let calls = 0;
    const result = await fetchAllRows(async (from) => {
      calls++;
      return { data: from === 0 ? Array.from({ length: 1000 }, (_, id) => ({ id })) : [], error: null };
    });
    expect(result.data).toHaveLength(1000);
    expect(calls).toBe(2);
  });

  test("rejects a failed later page instead of reporting partial totals", async () => {
    await expect(fetchAllRows(async (from) => from === 0
      ? { data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null }
      : { data: null, error: new Error("Page failed") }
    )).rejects.toThrow("Page failed");
  });
});