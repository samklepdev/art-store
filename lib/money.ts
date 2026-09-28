import { site } from "./site";

export function formatMoney(cents: number, currency: string = site.currency): string {
  return new Intl.NumberFormat(site.locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
