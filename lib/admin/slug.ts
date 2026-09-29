/**
 * Derives a URL slug from a product title.
 *
 * The products table enforces `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`, so this
 * strips diacritics, lowercases, collapses every run of other characters to a
 * single hyphen, and trims hyphens from the ends. Returns "" when no usable
 * characters remain — callers must treat that as a validation failure.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
