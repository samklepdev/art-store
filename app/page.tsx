import Image from "next/image";
import Link from "next/link";
import { ProductGrid } from "@/components/ProductCard";
import { getCollections, getProducts } from "@/lib/products";
import { shopHref } from "@/lib/shop";
import { site } from "@/lib/site";
import styles from "./page.module.css";

export default async function HomePage() {
  const [featured, collections] = await Promise.all([
    getProducts({ featuredOnly: true, limit: 8 }),
    getCollections(),
  ]);
  const hero = featured[0];
  const heroImage = hero?.images[0];

  return (
    <>
      <section className={`page-width ${styles.hero}`}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>{site.tagline}</h1>
          <p className={styles.heroCopy}>{site.statement}</p>
          <div className={styles.heroActions}>
            <Link href="/shop" className="btn btn-primary">
              Shop all work
            </Link>
            {hero && (
              <Link href={`/products/${hero.slug}`} className="btn btn-secondary">
                See {hero.title}
              </Link>
            )}
          </div>
        </div>
        {hero && heroImage && (
          <Link href={`/products/${hero.slug}`} className={styles.heroMedia} aria-label={hero.title}>
            <Image
              src={heroImage.url}
              alt={heroImage.alt}
              fill
              sizes="(min-width: 56rem) 50vw, 100vw"
              quality={90}
              loading="eager"
              fetchPriority="high"
              className={styles.heroImage}
            />
          </Link>
        )}
      </section>

      {featured.length > 0 && (
        <section className={`page-width ${styles.section}`}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Featured work</h2>
            <Link href="/shop">View all</Link>
          </div>
          <ProductGrid products={featured} />
        </section>
      )}

      {collections.length > 0 && (
        <section className={`page-width ${styles.section}`}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Shop by collection</h2>
          </div>
          <ul className={styles.collections}>
            {collections.map((c) => (
              <li key={c.name}>
                <Link href={shopHref({ collection: c.name })} className={styles.collection}>
                  <div className={styles.collectionMedia}>
                    {c.image && (
                      <Image src={c.image.url} alt="" fill sizes="(min-width: 48rem) 30vw, 100vw" className={styles.collectionImage} />
                    )}
                  </div>
                  <span className={styles.collectionName}>{c.name}</span>
                  <span className={styles.collectionCount}>
                    {c.count} {c.count === 1 ? "work" : "works"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {featured.length === 0 && collections.length === 0 && (
        <p className="page-width">
          No products yet. Run <code>npm run db:setup</code> or add rows to the <code>products</code> table.
        </p>
      )}
    </>
  );
}
