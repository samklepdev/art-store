import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getOrder } from "@/lib/admin/orders";
import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";
import type { OrderStatus, ShippingAddress } from "@/lib/types";
import { FulfillmentControl } from "./FulfillmentControl";
import styles from "../orders.module.css";

export const metadata: Metadata = { title: "Order" };

const dateFormat = new Intl.DateTimeFormat(site.locale, {
  dateStyle: "long",
  timeStyle: "short",
});

const STATUS_LABEL: Record<OrderStatus, string> = {
  paid: "Paid",
  fulfilled: "Fulfilled",
  refunded: "Refunded",
};

const STATUS_CLASS: Record<OrderStatus, string> = {
  paid: styles.badgePaid,
  fulfilled: styles.badgeFulfilled,
  refunded: styles.badgeRefunded,
};

function addressLines(address: ShippingAddress): string[] {
  return [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const order = await getOrder(id);
  if (!order) notFound();

  const lines = order.shippingAddress ? addressLines(order.shippingAddress) : [];

  return (
    <>
      <p>
        <Link href="/admin/orders" className={styles.backLink}>
          ← All orders
        </Link>
      </p>

      <div className={styles.header}>
        <h1 className={styles.heading}>Order #{order.id}</h1>
        <span className={STATUS_CLASS[order.status]}>{STATUS_LABEL[order.status]}</span>
      </div>

      <p className={styles.muted}>Placed {dateFormat.format(new Date(order.createdAt))}</p>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Customer</h2>
        <p>{order.customerName ?? "—"}</p>
        {order.email && <p>{order.email}</p>}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Shipping address</h2>
        {lines.length > 0 ? (
          <address className={styles.addressLines}>
            {lines.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </address>
        ) : (
          <p className={styles.muted}>No shipping address on file.</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Items</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{formatMoney(item.unitPriceCents, order.currency)}</td>
                  <td>{formatMoney(item.totalCents, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className={styles.totals}>
          <div className={styles.totalRow}>
            <dt>Subtotal</dt>
            <dd>{formatMoney(order.subtotalCents, order.currency)}</dd>
          </div>
          <div className={styles.totalRow}>
            <dt>Shipping</dt>
            <dd>{formatMoney(order.shippingCents, order.currency)}</dd>
          </div>
          <div className={`${styles.totalRow} ${styles.grandTotal}`}>
            <dt>Total</dt>
            <dd>{formatMoney(order.totalCents, order.currency)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section}>
        <FulfillmentControl orderId={order.id} status={order.status} />
        <p className={styles.sessionId}>Stripe session: {order.stripeSessionId}</p>
      </section>
    </>
  );
}
