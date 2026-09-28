"use client";

import { useCart } from "./CartProvider";
import styles from "./CartButton.module.css";

export function CartButton() {
  const { count, ready, open } = useCart();
  const shown = ready ? count : 0;

  return (
    <button
      type="button"
      className={styles.button}
      onClick={open}
      aria-label={shown === 1 ? "Cart, 1 item" : `Cart, ${shown} items`}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path
          d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8Z M9 8V6.5a3 3 0 0 1 6 0V8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      {shown > 0 && <span className={styles.badge}>{shown > 99 ? "99+" : shown}</span>}
    </button>
  );
}
