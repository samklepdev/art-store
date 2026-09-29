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

export type OrderStatus = "paid" | "fulfilled" | "refunded";

export type OrderSummary = {
  id: number;
  email: string | null;
  customerName: string | null;
  currency: string;
  totalCents: number;
  status: OrderStatus;
  itemCount: number;
  createdAt: string; // ISO
};

export type OrderItem = {
  id: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type ShippingAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export type OrderDetail = {
  id: number;
  stripeSessionId: string;
  email: string | null;
  customerName: string | null;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shippingAddress: ShippingAddress | null;
  status: OrderStatus;
  createdAt: string; // ISO
  items: OrderItem[];
};
