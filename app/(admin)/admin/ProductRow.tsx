"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
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
          onClick={() => startTransition(() => void togglePublished(row.id, !row.published))}
        >
          {row.published ? "Unpublish" : "Publish"}
        </button>
      </td>
    </tr>
  );
}
