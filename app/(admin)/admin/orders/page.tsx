import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listOrders } from "@/lib/admin/orders";
import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";
import type { OrderStatus } from "@/lib/types";
import styles from "./orders.module.css";

export const metadata: Metadata = { title: "Orders" };

const dateFormat = new Intl.DateTimeFormat(site.locale, {
  year: "numeric",
  month: "short",
  day: "numeric",
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

export default async function AdminOrders() {
  await requireAdmin();
  const orders = await listOrders();

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.heading}>Orders</h1>
      </div>

      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/admin/orders/${order.id}`} className={styles.orderLink}>
                      #{order.id}
                    </Link>
                  </td>
                  <td>{dateFormat.format(new Date(order.createdAt))}</td>
                  <td>
                    {order.customerName ?? <span className={styles.muted}>—</span>}
                    {order.email && <span className={styles.customerEmail}>{order.email}</span>}
                  </td>
                  <td>{order.itemCount}</td>
                  <td>{formatMoney(order.totalCents, order.currency)}</td>
                  <td>
                    <span className={STATUS_CLASS[order.status]}>{STATUS_LABEL[order.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
