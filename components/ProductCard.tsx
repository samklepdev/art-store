import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import type { ProductSummary } from "@/lib/types";
import styles from "./ProductCard.module.css";

export function ProductCard({ product, eager = false }: { product: ProductSummary; eager?: boolean }) {
  const [main, hover] = product.images;
  const badge = !product.available
    ? { text: "Sold out", tone: "muted" }
    : product.originalAvailable
      ? { text: "Original available", tone: "purple" }
      : product.onSale
        ? { text: "Sale", tone: "pink" }
        : null;
  const price =
    product.minPriceCents === product.maxPriceCents
      ? formatMoney(product.minPriceCents)
      : `From ${formatMoney(product.minPriceCents)}`;

  return (
    <Link href={`/products/${product.slug}`} className={styles.card}>
      <div className={styles.media}>
        <div className={styles.frame}>
          {main && (
            <Image
              src={main.url}
              alt={main.alt}
              fill
              sizes="(min-width: 64rem) 22vw, (min-width: 40rem) 30vw, 46vw"
              loading={eager ? "eager" : "lazy"}
              className={hover ? `${styles.image} ${styles.main}` : styles.image}
            />
          )}
          {hover && (
            <Image
              src={hover.url}
              alt=""
              fill
              sizes="(min-width: 64rem) 22vw, (min-width: 40rem) 30vw, 46vw"
              className={`${styles.image} ${styles.hover}`}
            />
          )}
        </div>
        {badge && (
          <span className={styles.badge} data-tone={badge.tone}>
            {badge.text}
          </span>
        )}
      </div>
      <h3 className={styles.title}>{product.title}</h3>
      <p className={styles.price}>{price}</p>
    </Link>
  );
}

export function ProductGrid({ products, eagerCount = 4 }: { products: ProductSummary[]; eagerCount?: number }) {
  return (
    <ul className={styles.grid}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} eager={i < eagerCount} />
        </li>
      ))}
    </ul>
  );
}
