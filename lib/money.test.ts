import { describe, expect, it } from "vitest";
import { parseMoney } from "./money";

describe("parseMoney", () => {
  it("parses whole dollars", () => {
    expect(parseMoney("220")).toBe(22000);
  });

  it("parses cents", () => {
    expect(parseMoney("220.50")).toBe(22050);
  });

  it("parses one decimal place", () => {
    expect(parseMoney("220.5")).toBe(22050);
  });

  it("strips commas, currency symbols and whitespace", () => {
    expect(parseMoney("$1,200.00")).toBe(120000);
    expect(parseMoney("  85 ")).toBe(8500);
  });

  it("avoids float drift", () => {
    expect(parseMoney("19.99")).toBe(1999);
  });

  it("accepts zero", () => {
    expect(parseMoney("0")).toBe(0);
  });

  it("rejects empty, junk, negatives and three decimals", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
  });
});
