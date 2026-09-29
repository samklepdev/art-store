import { describe, expect, it } from "vitest";
import { isSettableStatus } from "./orderStatus";

describe("isSettableStatus", () => {
  it("accepts paid", () => {
    expect(isSettableStatus("paid")).toBe(true);
  });

  it("accepts fulfilled", () => {
    expect(isSettableStatus("fulfilled")).toBe(true);
  });

  it("rejects refunded (set only in Stripe, never by the admin)", () => {
    expect(isSettableStatus("refunded")).toBe(false);
  });

  it("rejects unknown strings", () => {
    expect(isSettableStatus("shipped")).toBe(false);
    expect(isSettableStatus("")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isSettableStatus(null)).toBe(false);
    expect(isSettableStatus(undefined)).toBe(false);
    expect(isSettableStatus(1)).toBe(false);
    expect(isSettableStatus({})).toBe(false);
  });
});
