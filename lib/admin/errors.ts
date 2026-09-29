/**
 * Maps Postgres constraint violations to messages worth showing a person.
 *
 * Constraint names are the ones Postgres actually generated for this schema —
 * note the compare-at check is `variants_check`, not
 * `variants_compare_at_cents_check`, because it spans two columns and so
 * becomes a table-level constraint.
 */
const UNIQUE: Record<string, string> = {
  products_slug_key: "That web address is already used by another product.",
  variants_product_id_name_key: "This product already has a format with that name.",
  product_images_product_id_position_key:
    "Two images ended up in the same position. Reload the page and try again.",
};

const CHECK: Record<string, string> = {
  variants_check: "The compare-at price must be higher than the price.",
  products_slug_check:
    "The web address may only contain lowercase letters, numbers and dashes.",
  products_year_check: "The year must be between 1900 and 2100.",
  variants_price_cents_check: "The price cannot be negative.",
  variants_inventory_check: "The quantity in stock cannot be negative.",
  variants_kind_check: "A format must be either an original or a print.",
  product_images_width_check: "The image width must be a positive number of pixels.",
  product_images_height_check: "The image height must be a positive number of pixels.",
};

export function messageForDbError(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { code, constraint } = error as { code?: string; constraint?: string };

  if (code === "23505") {
    return (constraint && UNIQUE[constraint]) ?? "That value is already taken.";
  }
  if (code === "23514") {
    return (constraint && CHECK[constraint]) ?? "That value isn't allowed.";
  }
  return null;
}
