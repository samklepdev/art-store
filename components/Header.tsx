import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { getCollections } from "@/lib/products";
import { shopHref } from "@/lib/shop";
import { site } from "@/lib/site";
import { CartButton } from "./cart/CartButton";
import styles from "./Header.module.css";

export async function Header() {
  const collections = await getCollections();

  return (
    <>
      <p className={styles.announcement}>
        Free shipping on orders over {formatMoney(site.shipping.freeOverCents)}
      </p>
      <header className={styles.header}>
        <div className={`page-width ${styles.inner}`}>
          <Link href="/" className={styles.logo}>
            {site.name}
          </Link>
          <nav aria-label="Main" className={styles.nav}>
            <Link href="/shop">Shop all</Link>
            {collections.map((c) => (
              <Link key={c.name} href={shopHref({ collection: c.name })}>
                {c.name}
              </Link>
            ))}
          </nav>
          <div className={styles.actions}>
            <CartButton />
          </div>
        </div>
      </header>
    </>
  );
}
