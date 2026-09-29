import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/ProductCard";
import { SortSelect } from "@/components/SortSelect";
import { getCollections, getProducts } from "@/lib/products";
import { isSortKey, shopHref } from "@/lib/shop";
import styles from "./page.module.css";

type Props = {
  searchParams: Promise<{ collection?: string; sort?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { collection } = await searchParams;
  return { title: typeof collection === "string" ? collection : "Shop all" };
}

export default async function ShopPage({ searchParams }: Props) {
  const params = await searchParams;
  const sort = isSortKey(params.sort) ? params.sort : "featured";
  const collections = await getCollections();
  const active = collections.find((c) => c.name === params.collection)?.name ?? null;
  const products = await getProducts({ collection: active, sort });

  return (
    <div className="page-width">
      <header className={styles.head}>
        <h1 className={styles.title}>{active ?? "Shop all"}</h1>
      </header>

      <div className={styles.toolbar}>
        <nav aria-label="Collections" className={styles.filters}>
          <Link href={shopHref({ sort })} aria-current={active === null ? "page" : undefined} className={styles.filter}>
            All
          </Link>
          {collections.map((c) => (
            <Link
              key={c.name}
              href={shopHref({ collection: c.name, sort })}
              aria-current={active === c.name ? "page" : undefined}
              className={styles.filter}
            >
              {c.name}
            </Link>
          ))}
        </nav>
        <div className={styles.sortRow}>
          <p className={styles.count}>
            {products.length} {products.length === 1 ? "product" : "products"}
          </p>
          <SortSelect value={sort} collection={active} />
        </div>
      </div>

      {products.length > 0 ? (
        <ProductGrid products={products} />
      ) : (
        <div className={styles.empty}>
          <p>Nothing in this collection right now.</p>
          <Link href="/shop" className="btn btn-secondary">
            Shop all work
          </Link>
        </div>
      )}
    </div>
  );
}
