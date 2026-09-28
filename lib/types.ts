export type ProductImage = {
  id: number;
  url: string;
  width: number;
  height: number;
  alt: string;
};

export type Variant = {
  id: number;
  name: string;
  kind: "original" | "print";
  priceCents: number;
  compareAtCents: number | null;
  /** null = made to order, no stock limit */
  inventory: number | null;
  available: boolean;
};

export type Product = {
  id: number;
  slug: string;
  title: string;
  year: number | null;
  medium: string | null;
  dimensions: string | null;
  description: string | null;
  collection: string | null;
  images: ProductImage[];
  variants: Variant[];
};

/** The slimmer shape used on product cards and grids. */
export type ProductSummary = {
  id: number;
  slug: string;
  title: string;
  collection: string | null;
  minPriceCents: number;
  maxPriceCents: number;
  onSale: boolean;
  available: boolean;
  originalAvailable: boolean;
  /** First two images: the main image and the hover image. */
  images: ProductImage[];
};

export type Collection = {
  name: string;
  count: number;
  image: ProductImage | null;
};
