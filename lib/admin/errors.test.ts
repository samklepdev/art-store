import { describe, expect, it } from "vitest";
import { messageForDbError } from "./errors";

describe("messageForDbError", () => {
  it("names the slug collision", () => {
    const message = messageForDbError({ code: "23505", constraint: "products_slug_key" });
    expect(message).toMatch(/web address/i);
  });

  it("names the duplicate variant", () => {
    const message = messageForDbError({ code: "23505", constraint: "variants_product_id_name_key" });
    expect(message).toMatch(/format with that name/i);
  });

  it("explains the compare-at check, which Postgres names variants_check", () => {
    const message = messageForDbError({ code: "23514", constraint: "variants_check" });
    expect(message).toMatch(/compare-at/i);
  });

  it("explains the slug format check", () => {
    const message = messageForDbError({ code: "23514", constraint: "products_slug_check" });
    expect(message).toMatch(/lowercase/i);
  });

  it("explains the year range check", () => {
    const message = messageForDbError({ code: "23514", constraint: "products_year_check" });
    expect(message).toMatch(/1900/);
  });

  it("falls back to a generic message for unknown constraints of a known class", () => {
    expect(messageForDbError({ code: "23505", constraint: "something_else_key" })).not.toBeNull();
    expect(messageForDbError({ code: "23514", constraint: "something_else_check" })).not.toBeNull();
  });

  it("returns null for unrelated errors", () => {
    expect(messageForDbError({ code: "08006" })).toBeNull();
    expect(messageForDbError(new Error("boom"))).toBeNull();
    expect(messageForDbError(null)).toBeNull();
    expect(messageForDbError(undefined)).toBeNull();
  });
});
