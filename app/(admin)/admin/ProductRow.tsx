"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import type { AdminProductRow } from "@/lib/admin/products";
import { togglePublished } from "./actions";
import styles from "./products.module.css";

function priceLabel(row: AdminProductRow): string {
  if (row.minPriceCents === null || row.maxPriceCents === null) return "No formats";
  if (row.minPriceCents === row.maxPriceCents) return formatMoney(row.minPriceCents);
  return `${formatMoney(row.minPriceCents)} – ${formatMoney(row.maxPriceCents)}`;
}

export function ProductRow({ row }: { row: AdminProductRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <tr className={styles.row} data-pending={pending || undefined}>
      <td className={styles.thumbCell}>
        {row.imageUrl ? (
          <Image src={row.imageUrl} alt="" width={56} height={56} className={styles.thumb} />
        ) : (
          <span className={styles.noThumb} aria-hidden="true" />
        )}
      </td>
      <td>
        <Link href={`/admin/products/${row.id}`} className={styles.title}>
          {row.title}
        </Link>
        <span className={styles.slug}>/{row.slug}</span>
      </td>
      <td>{row.collection ?? <span className={styles.muted}>—</span>}</td>
      <td>{priceLabel(row)}</td>
      <td>{row.variantCount}</td>
      <td>
        {row.published ? (
          <span className={styles.badgeLive}>Live</span>
        ) : (
          <span className={styles.badgeDraft}>Draft</span>
        )}
        {row.featured && <span className={styles.badgeFeatured}>Featured</span>}
      </td>
      <td>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() =>
            // Await the promise rather than discarding it with `void`: React only holds a
            // transition pending while the callback's thenable is unsettled, so a
            // synchronous `undefined` ends it at once and `pending` never shows.
            // Deliberately no try/catch — togglePublished calls requireAdmin(), which
            // redirects on an expired session, and a catch here would swallow that
            // navigation. Expected failures arrive as a returned ActionResult.
            startTransition(async () => {
              setError(null);
              const result = await togglePublished(row.id, !row.published);
              if (!result.ok) setError(result.error);
            })
          }
        >
          {row.published ? "Unpublish" : "Publish"}
        </button>
        {error && (
          <span className={styles.rowError} role="alert">
            {error}
          </span>
        )}
      </td>
    </tr>
  );
}
