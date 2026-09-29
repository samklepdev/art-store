/**
 * The statuses the admin may set from the order screen. `refunded` is
 * deliberately excluded: refunds are issued in the Stripe dashboard, and
 * nothing in the app ever sets that status (see
 * docs/superpowers/specs/2026-09-29-admin-orders-design.md).
 */
export const SETTABLE_STATUSES = ["paid", "fulfilled"] as const;

export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

/** Narrows untrusted action input to a status the admin is allowed to set. */
export function isSettableStatus(x: unknown): x is SettableStatus {
  return typeof x === "string" && (SETTABLE_STATUSES as readonly string[]).includes(x);
}
