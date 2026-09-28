// Shared by the shop page (server) and the sort control (client).
export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

export function isSortKey(value: unknown): value is SortKey {
  return SORT_OPTIONS.some((o) => o.value === value);
}

export function shopHref({ collection, sort }: { collection?: string | null; sort?: SortKey }) {
  const params = new URLSearchParams();
  if (collection) params.set("collection", collection);
  if (sort && sort !== "featured") params.set("sort", sort);
  const query = params.toString();
  return query ? `/shop?${query}` : "/shop";
}
