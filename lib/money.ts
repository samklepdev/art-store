import { site } from "./site";

export function formatMoney(cents: number, currency: string = site.currency): string {
  return new Intl.NumberFormat(site.locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Parses a human-typed money string into integer cents.
 * Returns null when the input is not a plain, non-negative amount
 * with at most two decimal places.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
