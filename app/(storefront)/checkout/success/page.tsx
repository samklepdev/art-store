import type { Metadata } from "next";
import Link from "next/link";
import { ClearCart } from "@/components/cart/ClearCart";
import { formatMoney } from "@/lib/money";
import { getStripe } from "@/lib/stripe";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Order confirmed", robots: { index: false } };

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function SuccessPage({ searchParams }: Props) {
  const { session_id: sessionId } = await searchParams;

  let paid = false;
  let firstName: string | null = null;
  let email: string | null = null;
  let total: string | null = null;

  if (sessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
      firstName = session.customer_details?.name?.split(" ")[0] ?? null;
      email = session.customer_details?.email ?? null;
      total = session.amount_total !== null ? formatMoney(session.amount_total, session.currency ?? undefined) : null;
    } catch {
      // Unknown or expired session: fall through to the generic message.
    }
  }

  return (
    <div className={`page-width ${styles.page}`}>
      {paid ? (
        <>
          <ClearCart />
          <h1 className={styles.title}>Thank you{firstName ? `, ${firstName}` : ""}!</h1>
          <p className={styles.copy}>
            Your order{total ? ` of ${total}` : ""} is confirmed.
            {email && ` A confirmation will be sent to ${email}.`} You&rsquo;ll get another email when it ships.
          </p>
        </>
      ) : (
        <>
          <h1 className={styles.title}>We couldn&rsquo;t confirm this order</h1>
          <p className={styles.copy}>
            If you were charged, your order is still being processed and you&rsquo;ll receive an email shortly.
            Otherwise, your cart is saved and you can check out again.
          </p>
        </>
      )}
      <Link href="/shop" className="btn btn-primary">
        Continue shopping
      </Link>
    </div>
  );
}
