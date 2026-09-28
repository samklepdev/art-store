import Link from "next/link";
import { getCollections } from "@/lib/products";
import { shopHref } from "@/lib/shop";
import { site } from "@/lib/site";
import styles from "./Footer.module.css";

export async function Footer() {
  const collections = await getCollections();

  return (
    <footer className={styles.footer}>
      <div className={`page-width ${styles.grid}`}>
        <div>
          <p className={styles.brand}>{site.name}</p>
          <p className={styles.muted}>{site.tagline}</p>
        </div>
        <nav aria-label="Shop">
          <h2 className={styles.heading}>Shop</h2>
          <ul className={styles.links}>
            <li>
              <Link href="/shop">Shop all</Link>
            </li>
            {collections.map((c) => (
              <li key={c.name}>
                <Link href={shopHref({ collection: c.name })}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className={styles.heading}>Questions</h2>
          <p className={styles.muted}>
            Commissions, shipping or anything else: <a href={`mailto:${site.email}`}>{site.email}</a>
          </p>
        </div>
      </div>
      <div className={`page-width ${styles.bottom}`}>
        <p>
          © {new Date().getFullYear()} {site.name}
        </p>
        <p>Payments processed securely by Stripe</p>
      </div>
    </footer>
  );
}
