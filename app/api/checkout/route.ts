import { NextResponse } from "next/server";
import { getVariantsForCheckout } from "@/lib/products";
import { site } from "@/lib/site";
import { getStripe } from "@/lib/stripe";

type Body = { items?: unknown };

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request.");
  }

  // Merge and sanitise what the browser sent: only ids and quantities are trusted.
  const requested = new Map<number, number>();
  for (const raw of Array.isArray(body.items) ? body.items : []) {
    const item = raw as { variantId?: unknown; quantity?: unknown };
    const id = Number(item.variantId);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1) continue;
    requested.set(id, Math.min((requested.get(id) ?? 0) + quantity, site.maxQuantity));
  }
  if (requested.size === 0) return fail("Your cart is empty.");

  const variants = await getVariantsForCheckout([...requested.keys()]);
  if (variants.length !== requested.size) {
    return fail("Some items in your cart are no longer available. Remove them and try again.", 409);
  }

  for (const v of variants) {
    const quantity = requested.get(v.id) ?? 0;
    if (v.inventory !== null && v.inventory < quantity) {
      return fail(
        v.inventory === 0
          ? `${v.productTitle} (${v.name}) has sold out. Remove it from your cart to continue.`
          : `Only ${v.inventory} of ${v.productTitle} (${v.name}) left. Lower the quantity to continue.`,
        409,
      );
    }
  }

  const subtotal = variants.reduce((sum, v) => sum + v.priceCents * (requested.get(v.id) ?? 0), 0);
  const freeShipping = subtotal >= site.shipping.freeOverCents;
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: variants.map((v) => {
        const imageUrl = v.imageUrl ? new URL(v.imageUrl, origin).href : null;
        return {
          quantity: requested.get(v.id) ?? 1,
          price_data: {
            currency: site.currency,
            unit_amount: v.priceCents,
            product_data: {
              name: `${v.productTitle} (${v.name})`,
              images: imageUrl?.startsWith("https://") ? [imageUrl] : undefined,
              metadata: { variantId: String(v.id) },
            },
          },
        };
      }),
      shipping_address_collection: { allowed_countries: [...site.shipping.countries] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: freeShipping ? "Free shipping" : site.shipping.label,
            fixed_amount: {
              amount: freeShipping ? 0 : site.shipping.flatRateCents,
              currency: site.currency,
            },
          },
        },
      ],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart`,
    });

    if (!session.url) return fail("Checkout couldn't start. Try again in a moment.", 502);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error", error);
    return fail("Checkout couldn't start. Try again in a moment.", 502);
  }
}
