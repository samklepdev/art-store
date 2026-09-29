import { describe, expect, it } from "vitest";
import { readVariantInput } from "./variantInput";

/** Builds the FormData a variant row submits. Omit a key to leave it unset. */
function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const valid = {
  name: "Original",
  kind: "original",
  price: "220",
  inventory: "1",
  position: "0",
};

describe("readVariantInput", () => {
  it("parses a valid original", () => {
    expect(readVariantInput(form(valid))).toEqual({
      name: "Original",
      kind: "original",
      priceCents: 22000,
      compareAtCents: null,
      inventory: 1,
      sku: null,
      position: 0,
    });
  });

  // The tri-state inventory distinction is the whole point of this parser:
  // made-to-order (NULL) must never collapse into sold-out (0), or vice versa.
  it("stores NULL inventory for a made-to-order format, ignoring the inventory field", () => {
    const result = readVariantInput(
      form({ ...valid, kind: "print", madeToOrder: "on", inventory: "9" }),
    );
    expect(result).toMatchObject({ inventory: null });
  });

  it("stores 0 (sold out) when not made-to-order and the inventory field is blank", () => {
    const result = readVariantInput(form({ ...valid, inventory: "" }));
    expect(result).toMatchObject({ inventory: 0 });
  });

  it("stores the given quantity when not made-to-order", () => {
    const result = readVariantInput(form({ ...valid, inventory: "5" }));
    expect(result).toMatchObject({ inventory: 5 });
  });

  it("rejects a missing name", () => {
    expect(readVariantInput(form({ ...valid, name: "  " }))).toEqual({
      ok: false,
      error: "A format name is required.",
      field: "name",
    });
  });

  it("rejects an unknown kind", () => {
    expect(readVariantInput(form({ ...valid, kind: "poster" }))).toMatchObject({
      ok: false,
      field: "kind",
    });
  });

  it("rejects an unparseable price", () => {
    expect(readVariantInput(form({ ...valid, price: "free" }))).toMatchObject({
      ok: false,
      field: "price",
    });
  });

  it("rejects an unparseable compare-at price", () => {
    expect(readVariantInput(form({ ...valid, compareAt: "lots" }))).toMatchObject({
      ok: false,
      field: "compareAt",
    });
  });

  it("rejects a compare-at price at or below the price", () => {
    expect(readVariantInput(form({ ...valid, price: "220", compareAt: "220" }))).toMatchObject({
      ok: false,
      field: "compareAt",
    });
  });

  it("accepts a compare-at price above the price", () => {
    expect(readVariantInput(form({ ...valid, price: "220", compareAt: "260" }))).toMatchObject({
      priceCents: 22000,
      compareAtCents: 26000,
    });
  });

  it("rejects negative inventory", () => {
    expect(readVariantInput(form({ ...valid, inventory: "-1" }))).toMatchObject({
      ok: false,
      field: "inventory",
    });
  });

  it("rejects non-integer inventory", () => {
    expect(readVariantInput(form({ ...valid, inventory: "2.5" }))).toMatchObject({
      ok: false,
      field: "inventory",
    });
  });

  it("rejects a non-integer position", () => {
    expect(readVariantInput(form({ ...valid, position: "1.5" }))).toMatchObject({
      ok: false,
      field: "position",
    });
  });

  it("defaults a blank position to 0", () => {
    expect(readVariantInput(form({ ...valid, position: "" }))).toMatchObject({ position: 0 });
  });

  it("trims a SKU and stores null when blank", () => {
    expect(readVariantInput(form({ ...valid, sku: "  ABC-1 " }))).toMatchObject({ sku: "ABC-1" });
    expect(readVariantInput(form({ ...valid, sku: "   " }))).toMatchObject({ sku: null });
  });
});
