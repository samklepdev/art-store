"use client";

import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { cartLimit, useCart } from "./CartProvider";
import { QuantityInput } from "./QuantityInput";
import styles from "./CartLines.module.css";

export function CartLines({ onNavigate }: { onNavigate?: () => void }) {
  const { lines, setQuantity, remove } = useCart();

  return (
    <ul className={styles.lines}>
      {lines.map((line) => {
        const max = cartLimit(line);
        return (
          <li key={line.variantId} className={styles.line}>
            <Link href={`/products/${line.productSlug}`} className={styles.thumb} onClick={onNavigate}>
              {line.imageUrl && (
                <Image src={line.imageUrl} alt={line.imageAlt} fill sizes="6rem" className={styles.image} />
              )}
            </Link>
            <div className={styles.info}>
              <Link href={`/products/${line.productSlug}`} className={styles.title} onClick={onNavigate}>
                {line.productTitle}
              </Link>
              <p className={styles.variant}>{line.variantName}</p>
              <p className={styles.unit}>{formatMoney(line.priceCents)}</p>
              <div className={styles.controls}>
                {max > 1 ? (
                  <QuantityInput
                    size="small"
                    value={line.quantity}
                    max={max}
                    onChange={(q) => setQuantity(line.variantId, q)}
                    label={`Quantity for ${line.productTitle}, ${line.variantName}`}
                  />
                ) : (
                  <span className={styles.single}>One of one</span>
                )}
                <button type="button" className={styles.remove} onClick={() => remove(line.variantId)}>
                  Remove
                </button>
              </div>
            </div>
            <p className={styles.total}>{formatMoney(line.priceCents * line.quantity)}</p>
          </li>
        );
      })}
    </ul>
  );
}
