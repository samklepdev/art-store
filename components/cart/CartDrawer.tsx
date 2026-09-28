"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { startCheckout } from "@/lib/checkout-client";
import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";
import { CartLines } from "./CartLines";
import { useCart } from "./CartProvider";
import styles from "./CartDrawer.module.css";

export function CartDrawer() {
  const cart = useCart();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isOpen, close } = cart;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  // Close when navigating to another page.
  useEffect(() => {
    close();
  }, [pathname, close]);

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

  const remainingForFree = site.shipping.freeOverCents - cart.subtotalCents;

  return (
    <dialog
      ref={dialogRef}
      className={styles.drawer}
      aria-labelledby="cart-drawer-title"
      onClose={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={styles.inner}>
        <div className={styles.head}>
          <h2 id="cart-drawer-title" className={styles.title}>
            Your cart
          </h2>
          <button type="button" className={styles.close} onClick={close} aria-label="Close cart">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {cart.lines.length === 0 ? (
          <div className={styles.empty}>
            <p>Your cart is empty.</p>
            <Link href="/shop" className="btn btn-primary" onClick={close}>
              Continue shopping
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.freeShipping} data-unlocked={remainingForFree <= 0 || undefined}>
              <p>
                {remainingForFree > 0
                  ? `Add ${formatMoney(remainingForFree)} more for free shipping.`
                  : "Your order ships free."}
              </p>
              <div className={styles.progress} aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(100, (cart.subtotalCents / site.shipping.freeOverCents) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className={styles.body}>
              <CartLines onNavigate={close} />
            </div>
            <div className={styles.foot}>
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
              <Link href="/cart" className={styles.viewCart} onClick={close}>
                View cart
              </Link>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
