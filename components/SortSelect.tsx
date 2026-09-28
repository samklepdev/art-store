"use client";

import { useRouter } from "next/navigation";
import { SORT_OPTIONS, isSortKey, shopHref, type SortKey } from "@/lib/shop";
import styles from "./SortSelect.module.css";

export function SortSelect({ value, collection }: { value: SortKey; collection: string | null }) {
  const router = useRouter();

  return (
    <label className={styles.label}>
      Sort by
      <select
        className={styles.select}
        value={value}
        onChange={(e) => {
          const sort = isSortKey(e.target.value) ? e.target.value : "featured";
          router.push(shopHref({ collection, sort }), { scroll: false });
        }}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
