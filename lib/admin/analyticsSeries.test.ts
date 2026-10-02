import { describe, expect, it } from "vitest";
import { fillDailySeries } from "./analyticsSeries";

// Local midnight, timezone-independent for the test runner.
const END = new Date(2026, 8, 29); // 2026-09-29

describe("fillDailySeries", () => {
  it("returns exactly `days` entries, oldest first, ending on endDate", () => {
    const series = fillDailySeries([], END, 3);
    expect(series.map((d) => d.date)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29"]);
  });

  it("zero-fills days with no rows", () => {
    const series = fillDailySeries([{ date: "2026-09-28", revenueCents: 500 }], END, 3);
    expect(series).toEqual([
      { date: "2026-09-27", revenueCents: 0 },
      { date: "2026-09-28", revenueCents: 500 },
      { date: "2026-09-29", revenueCents: 0 },
    ]);
  });

  it("uses the revenue from matching rows", () => {
    const rows = [
      { date: "2026-09-27", revenueCents: 100 },
      { date: "2026-09-29", revenueCents: 300 },
    ];
    expect(fillDailySeries(rows, END, 3).map((d) => d.revenueCents)).toEqual([100, 0, 300]);
  });

  it("ignores rows outside the window", () => {
    const rows = [
      { date: "2026-09-20", revenueCents: 999 }, // before window
      { date: "2026-10-05", revenueCents: 999 }, // after window
      { date: "2026-09-28", revenueCents: 500 },
    ];
    const series = fillDailySeries(rows, END, 3);
    expect(series).toEqual([
      { date: "2026-09-27", revenueCents: 0 },
      { date: "2026-09-28", revenueCents: 500 },
      { date: "2026-09-29", revenueCents: 0 },
    ]);
  });

  it("handles an empty window as all zeros", () => {
    const series = fillDailySeries([], END, 1);
    expect(series).toEqual([{ date: "2026-09-29", revenueCents: 0 }]);
  });
});
