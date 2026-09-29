"use client";

import { useState, useTransition } from "react";
import type { OrderStatus } from "@/lib/types";
import { setOrderStatusAction } from "../../actions";
import styles from "../orders.module.css";

export function FulfillmentControl({
  orderId,
  status,
}: {
  orderId: number;
  status: OrderStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Nothing in the app sets `refunded`; if one ever appears, there is no admin
  // action for it — refunds live in Stripe.
  if (status === "refunded") {
    return <p className={styles.muted}>This order was refunded in Stripe.</p>;
  }

  const next = status === "paid" ? "fulfilled" : "paid";
  const label = status === "paid" ? "Mark fulfilled" : "Mark paid";

  return (
    <div className={styles.control}>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          // Await the promise so React holds the transition pending (a
          // synchronous undefined would end it at once). No try/catch:
          // setOrderStatusAction calls requireAdmin(), which redirects on an
          // expired session, and a catch here would swallow that navigation.
          // Expected failures arrive as a returned ActionResult.
          startTransition(async () => {
            setError(null);
            const result = await setOrderStatusAction(orderId, next);
            if (!result.ok) setError(result.error);
          })
        }
      >
        {label}
      </button>
      {error && (
        <span className={styles.rowError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
