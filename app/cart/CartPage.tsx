"use client";

import { useState } from "react";
import Link from "next/link";
import { CartLines } from "@/components/cart/CartLines";
import { useCart } from "@/components/cart/CartProvider";
import { startCheckout } from "@/lib/checkout-client";
import { formatMoney } from "@/lib/money";
import styles from "./page.module.css";

export function CartPage() {
  const cart = useCart();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setPending(true);
    setError(null);
    const message = await startCheckout(
      cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    );
    if (message) {
      setError(message);
      setPending(false);
    }
  }

  return (
    <div className={`page-width ${styles.page}`}>
      <div className={styles.head}>
        <h1 className={styles.title}>Your cart</h1>
        <Link href="/shop">Continue shopping</Link>
      </div>

      {!cart.ready ? null : cart.lines.length === 0 ? (
        <div className={styles.empty}>
          <p>Your cart is empty.</p>
          <Link href="/shop" className="btn btn-primary">
            Shop all work
          </Link>
        </div>
      ) : (
        <div className={styles.layout}>
          <CartLines />
          <aside className={styles.summary}>
            <p className={styles.subtotal}>
              <span>Subtotal</span>
              <span>{formatMoney(cart.subtotalCents)}</span>
            </p>
            <p className={styles.note}>Taxes and shipping calculated at checkout.</p>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn btn-primary btn-block" onClick={checkout} disabled={pending}>
              {pending ? "Opening checkout…" : "Check out"}
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
