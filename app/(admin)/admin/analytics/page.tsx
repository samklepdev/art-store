import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getRevenueAnalytics } from "@/lib/admin/analytics";
import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";
import { RevenueChart } from "./RevenueChart";
import styles from "./analytics.module.css";

export const metadata: Metadata = { title: "Analytics" };

export default async function AdminAnalytics() {
  await requireAdmin();
  const { totals, daily, topItems } = await getRevenueAnalytics();

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.heading}>Analytics</h1>
        <span className={styles.windowLabel}>Last 30 days</span>
      </div>

      <div className={styles.tiles}>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Revenue</span>
          <span className={styles.tileValue}>{formatMoney(totals.revenueCents, site.currency)}</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Orders</span>
          <span className={styles.tileValue}>{totals.orderCount}</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Avg order value</span>
          <span className={styles.tileValue}>
            {formatMoney(totals.avgOrderValueCents, site.currency)}
          </span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Items sold</span>
          <span className={styles.tileValue}>{totals.itemsSold}</span>
        </div>
      </div>

      {totals.orderCount === 0 ? (
        <p className={styles.empty}>No orders in the last 30 days.</p>
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionHeading}>Revenue over time</h2>
            <RevenueChart data={daily} currency={site.currency} />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionHeading}>Top-selling items</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.map((item) => (
                    <tr key={item.description}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>{formatMoney(item.revenueCents, site.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
