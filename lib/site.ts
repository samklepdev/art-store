// Store settings. Safe to import from client and server code.
export const site = {
  name: "Your Name",
  tagline: "Originals and prints",
  statement:
    "Paintings and drawings, available as one-of-one originals and archival prints. Replace this with a line about your work.",
  email: "hello@example.com",
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
