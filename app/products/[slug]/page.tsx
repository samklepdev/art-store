import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/ProductCard";
import { ProductForm } from "@/components/ProductForm";
import { ProductGallery } from "@/components/ProductGallery";
import { getProductBySlug, getProducts } from "@/lib/products";
import { shopHref } from "@/lib/shop";
import { site } from "@/lib/site";
import styles from "./page.module.css";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  const image = product.images[0];

  return {
    title: product.title,
    description:
      product.description ?? [product.title, product.year, product.medium].filter(Boolean).join(", "),
    openGraph: image
      ? { images: [{ url: image.url, width: image.width, height: image.height, alt: image.alt }] }
      : undefined,
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = product.collection
    ? await getProducts({ collection: product.collection, excludeId: product.id, limit: 4 })
    : [];

  const details = [
    { label: "Year", value: product.year },
    { label: "Medium", value: product.medium },
    { label: "Original size", value: product.dimensions },
  ].filter((d) => d.value !== null && d.value !== "");

  const prices = product.variants.map((v) => v.priceCents);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    image: product.images.map((i) => i.url),
    brand: { "@type": "Brand", name: site.name },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: site.currency.toUpperCase(),
      lowPrice: prices.length ? Math.min(...prices) / 100 : undefined,
      highPrice: prices.length ? Math.max(...prices) / 100 : undefined,
      availability: product.variants.some((v) => v.available)
        ? "https://schema.org/InStock"
        : "https://schema.org/SoldOut",
    },
  };

  return (
    <div className="page-width">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link href="/shop">Shop</Link>
        {product.collection && (
          <>
            <span aria-hidden="true">/</span>
            <Link href={shopHref({ collection: product.collection })}>{product.collection}</Link>
          </>
        )}
      </nav>

      <div className={styles.layout}>
        <ProductGallery images={product.images} title={product.title} />

        <div className={styles.info}>
          <p className={styles.vendor}>{site.name}</p>
          <h1 className={styles.title}>{product.title}</h1>

          <ProductForm
            slug={product.slug}
            title={product.title}
            variants={product.variants}
            image={product.images[0] ?? null}
          />

          {product.description && <p className={styles.description}>{product.description}</p>}

          <div className={styles.accordions}>
            {details.length > 0 && (
              <details className={styles.accordion} open>
                <summary>About the work</summary>
                <dl className={styles.specs}>
                  {details.map((d) => (
                    <div key={d.label}>
                      <dt>{d.label}</dt>
                      <dd>{d.value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <details className={styles.accordion}>
              <summary>Prints</summary>
              <p>
                Archival pigment prints on cotton rag paper, printed to order and shipped flat or rolled in a
                tube. Edit this text to match how you produce your prints.
              </p>
            </details>
            <details className={styles.accordion}>
              <summary>Shipping and returns</summary>
              <p>
                Prints ship within 5 to 7 business days. Originals ship crated and insured within 10 business
                days. Contact <a href={`mailto:${site.email}`}>{site.email}</a> within 14 days of delivery
                about returns.
              </p>
            </details>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className={styles.related}>
          <h2 className={styles.relatedTitle}>More from {product.collection}</h2>
          <ProductGrid products={related} eagerCount={0} />
        </section>
      )}
    </div>
  );
}
