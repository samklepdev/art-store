// Store settings. Safe to import from client and server code.
export const site = {
  name: "Sam Klepper",
  tagline: "Originals and prints",
  statement:
    "Paintings and illustrations, available as one-of-one originals and archival prints. All work is signed and shipped from the US.",
  email: "hello@samklepper.shop",
  currency: "usd",
  locale: "en-US",
  /** Most of one print a customer can buy at once. */
  maxQuantity: 10,
  shipping: {
    label: "Standard shipping",
    flatRateCents: 1200,
    freeOverCents: 15000,
    countries: ["US", "CA"] as const,
  },
};
