import { parseMoney } from "@/lib/money";
import type { VariantInput } from "@/lib/admin/variants";

/**
 * A field-scoped validation error. Structurally the failure half of the admin
 * `ActionResult`, so a caller can return it directly, but declared here so this
 * parser stays a pure module with no dependency on the `"use server"` actions
 * file — which is what makes it unit-testable.
 */
export type FieldError = { ok: false; error: string; field?: string };

/**
 * Parses a variant ("format") row's FormData into a VariantInput, or returns a
 * field error describing the first problem. Pure: no I/O, no auth, no DB.
 */
export function readVariantInput(formData: FormData): VariantInput | FieldError {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "A format name is required.", field: "name" };

  const kindRaw = String(formData.get("kind") ?? "");
  if (kindRaw !== "original" && kindRaw !== "print") {
    return { ok: false, error: "Choose original or print.", field: "kind" };
  }

  const priceCents = parseMoney(String(formData.get("price") ?? ""));
  if (priceCents === null) {
    return { ok: false, error: "Enter a price like 220 or 220.50.", field: "price" };
  }

  const compareRaw = String(formData.get("compareAt") ?? "").trim();
  let compareAtCents: number | null = null;
  if (compareRaw !== "") {
    compareAtCents = parseMoney(compareRaw);
    if (compareAtCents === null) {
      return { ok: false, error: "Enter a compare-at price like 260.", field: "compareAt" };
    }
    if (compareAtCents <= priceCents) {
      return {
        ok: false,
        error: "The compare-at price must be higher than the price.",
        field: "compareAt",
      };
    }
  }

  // Tri-state inventory: the checkbox is the only way to express NULL.
  let inventory: number | null = null;
  if (formData.get("madeToOrder") !== "on") {
    const raw = String(formData.get("inventory") ?? "").trim();
    inventory = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(inventory) || inventory < 0) {
      return { ok: false, error: "Stock must be 0 or a whole number.", field: "inventory" };
    }
  }

  const positionRaw = String(formData.get("position") ?? "").trim();
  const position = positionRaw === "" ? 0 : Number(positionRaw);
  if (!Number.isInteger(position)) {
    return { ok: false, error: "Position must be a whole number.", field: "position" };
  }

  const sku = String(formData.get("sku") ?? "").trim() || null;

  return { name, kind: kindRaw, priceCents, compareAtCents, inventory, sku, position };
}
