"use client";

import { useId, useState } from "react";
import { startCheckout } from "@/lib/checkout-client";
import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";
import type { ProductImage, Variant } from "@/lib/types";
import { useCart } from "./cart/CartProvider";
import { QuantityInput } from "./cart/QuantityInput";
import styles from "./ProductForm.module.css";

type Props = {
  slug: string;
  title: string;
  variants: Variant[];
  image: ProductImage | null;
};

export function ProductForm({ slug, title, variants, image }: Props) {
  const cart = useCart();
  const groupName = useId();
  const initial = variants.find((v) => v.available) ?? variants[0];
  const [variantId, setVariantId] = useState(initial?.id);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variant = variants.find((v) => v.id === variantId) ?? initial;
  if (!variant) return <p className={styles.unavailable}>This work isn&rsquo;t available to buy yet.</p>;

  const limit = Math.min(variant.inventory ?? site.maxQuantity, site.maxQuantity);
  const inCart = cart.lines.find((l) => l.variantId === variant.id)?.quantity ?? 0;
  const room = Math.max(limit - inCart, 0);
  const canBuy = variant.available && room > 0;
  const qty = Math.min(quantity, Math.max(room, 1));

  const addToCart = () => {
    cart.add(
      {
        variantId: variant.id,
        productSlug: slug,
        productTitle: title,
        variantName: variant.name,
        priceCents: variant.priceCents,
        imageUrl: image?.url ?? null,
        imageAlt: image?.alt ?? "",
        maxQuantity: variant.inventory,
      },
      qty,
    );
    setQuantity(1);
  };

  const buyNow = async () => {
    setPending(true);
    setError(null);
    const message = await startCheckout([{ variantId: variant.id, quantity: qty }]);
    if (message) {
      setError(message);
      setPending(false);
    }
  };

  return (
    <div className={styles.form}>
      <div className={styles.priceRow}>
        {variant.compareAtCents !== null && (
          <s className={styles.compare}>
            <span className="visually-hidden">Regular price </span>
            {formatMoney(variant.compareAtCents)}
          </s>
        )}
        <span className={styles.price}>
          {variant.compareAtCents !== null && <span className="visually-hidden">Sale price </span>}
          {formatMoney(variant.priceCents)}
        </span>
        {variant.compareAtCents !== null && <span className={styles.saleBadge}>Sale</span>}
        {!variant.available && <span className={styles.soldBadge}>Sold out</span>}
      </div>
      <p className={styles.note}>
        Shipping calculated at checkout. Free over {formatMoney(site.shipping.freeOverCents)}.
      </p>
      {variant.available && (
        <p className={styles.stock}>
          <span className={styles.dot} aria-hidden="true" />
          {variant.kind === "original"
            ? "Available, ships in 10 business days"
            : variant.inventory === null
              ? "Printed to order, ships in 5 to 7 business days"
              : `In stock, ${variant.inventory} left`}
        </p>
      )}

      {variants.length > 1 && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>
            Format: <span>{variant.name}</span>
          </legend>
          <div className={styles.pills}>
            {variants.map((v) => (
              <label key={v.id} className={styles.pill} data-unavailable={!v.available || undefined}>
                <input
                  type="radio"
                  name={groupName}
                  value={v.id}
                  checked={v.id === variant.id}
                  onChange={() => {
                    setVariantId(v.id);
                    setQuantity(1);
                    setError(null);
                  }}
                />
                <span>
                  {v.name}
                  {!v.available && <span className="visually-hidden"> (sold out)</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {variant.kind === "original" ? (
        <p className={styles.original}>
          {variant.available ? "One of one. Signed, and ships with a certificate of authenticity." : "This original has found a home. Prints are still available."}
        </p>
      ) : (
        canBuy &&
        limit > 1 && (
          <div className={styles.quantity}>
            <span className={styles.legend}>Quantity</span>
            <QuantityInput value={qty} max={room} onChange={setQuantity} label="Quantity" />
          </div>
        )
      )}

      <div className={styles.buttons}>
        <button type="button" className="btn btn-secondary btn-block" onClick={addToCart} disabled={!canBuy}>
          {!variant.available ? "Sold out" : room === 0 ? "In your cart" : "Add to cart"}
        </button>
        {canBuy && (
          <button type="button" className="btn btn-primary btn-block" onClick={buyNow} disabled={pending}>
            {pending ? "Opening checkout…" : "Buy it now"}
          </button>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
