import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";

export type PolicySection = { heading?: string; paragraphs: string[] };

export type Policy = {
  slug: "shipping" | "returns" | "privacy" | "terms";
  title: string;
  updated: string; // ISO date
  sections: PolicySection[];
};

// Facts come from site.ts so the copy never drifts from the store config.
const flat = formatMoney(site.shipping.flatRateCents); // $12.00
const freeOver = formatMoney(site.shipping.freeOverCents); // $150.00
const email = site.email;
const UPDATED = "2026-10-05";

export const POLICIES: Policy[] = [
  {
    slug: "shipping",
    title: "Shipping policy",
    updated: UPDATED,
    sections: [
      {
        heading: "Where we ship",
        paragraphs: [
          "We ship to the United States and Canada. All work is packed and shipped from the US.",
        ],
      },
      {
        heading: "Rates",
        paragraphs: [`Standard shipping is a flat ${flat}. Orders over ${freeOver} ship free.`],
      },
      {
        heading: "Processing time",
        paragraphs: [
          "Orders are prepared and dispatched within 3–5 business days. Prints are made to order; originals are packed with extra care.",
        ],
      },
      {
        heading: "Transit & tracking",
        paragraphs: [
          "Delivery time depends on the carrier and destination. A tracking link is emailed when your order ships.",
        ],
      },
      {
        heading: "Customs & duties",
        paragraphs: [
          "Canadian orders may be subject to import duties or taxes set by your country; these are the recipient's responsibility.",
        ],
      },
      {
        heading: "Problems",
        paragraphs: [
          `If your order is lost or arrives damaged, email ${email} within 14 days of the delivery date and we'll make it right.`,
        ],
      },
    ],
  },
  {
    slug: "returns",
    title: "Returns & refunds",
    updated: UPDATED,
    sections: [
      {
        heading: "Originals",
        paragraphs: [
          "Original works are one of a kind and are final sale — they can't be returned or exchanged. Please reach out with any questions before purchasing.",
        ],
      },
      {
        heading: "Prints",
        paragraphs: [
          `If a print arrives damaged or defective, email ${email} within 14 days of delivery with photos and we'll send a replacement or issue a refund.`,
        ],
      },
      {
        heading: "Change of mind",
        paragraphs: [
          "We don't accept change-of-mind returns on prints; contact us if there's a problem and we'll do our best to help.",
        ],
      },
      {
        heading: "Condition",
        paragraphs: ["Any approved return must be unused and in its original packaging."],
      },
      {
        heading: "Return shipping",
        paragraphs: [
          "We cover return shipping when an item was damaged or defective; otherwise the buyer pays it.",
        ],
      },
      {
        heading: "Refunds",
        paragraphs: [
          "Approved refunds go back to your original payment method through Stripe, usually within 5–10 business days of us receiving or approving the return.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    updated: UPDATED,
    sections: [
      {
        heading: "What we collect",
        paragraphs: [
          "To fulfil orders we collect your name, email, shipping address and order details. That's it — there are no customer accounts.",
        ],
      },
      {
        heading: "Payments",
        paragraphs: [
          "Payments are processed by Stripe. Card details are entered on Stripe's systems; we never see or store your card number.",
        ],
      },
      {
        heading: "Your cart",
        paragraphs: ["Your cart is stored in your own browser (local storage), not on our servers."],
      },
      {
        heading: "Email",
        paragraphs: [
          "We use your email only to send order and shipping updates. Payment receipts are sent by Stripe.",
        ],
      },
      {
        heading: "No tracking",
        paragraphs: [
          "We don't use third-party advertising or analytics trackers, and we don't sell your data. We share information only with Stripe (to take payment) and the shipping carrier (to deliver your order).",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "We use only the essential storage needed to run the cart and the admin sign-in.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [`To ask what we hold about you, or to have it deleted, email ${email}.`],
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms of service",
    updated: UPDATED,
    sections: [
      {
        heading: "These terms",
        paragraphs: [
          "By buying from this store you agree to these terms. We may update them; the \"last updated\" date shows when.",
        ],
      },
      {
        heading: "Prices & availability",
        paragraphs: [
          "Prices are in US dollars and may change. Availability isn't guaranteed — in particular, original works are one of a kind. If an original sells at the same moment to someone else, we'll cancel the duplicate order and refund it in full.",
        ],
      },
      {
        heading: "Orders",
        paragraphs: [
          "An order is accepted when payment is captured. We may cancel and refund an order if an item turns out to be unavailable or if there's a pricing error.",
        ],
      },
      {
        heading: "Intellectual property",
        paragraphs: [
          `All artwork and images on this site are © ${site.name}. Buying a piece gives you the physical item; it does not transfer copyright or any reproduction rights.`,
        ],
      },
      {
        heading: "Liability",
        paragraphs: [
          "The store and its work are provided as-is to the extent the law allows; we're not liable for indirect or incidental damages.",
        ],
      },
      {
        heading: "Governing law",
        paragraphs: ["These terms are governed by the laws of [your state/country]."],
      },
      {
        heading: "Contact",
        paragraphs: [`Questions: ${email}.`],
      },
    ],
  },
];

export function getPolicy(slug: string): Policy | undefined {
  return POLICIES.find((p) => p.slug === slug);
}

export const POLICY_LINKS = POLICIES.map((p) => ({ slug: p.slug, title: p.title }));
