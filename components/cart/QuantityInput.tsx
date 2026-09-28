"use client";

import styles from "./QuantityInput.module.css";

type Props = {
  value: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  size?: "regular" | "small";
};

export function QuantityInput({ value, max, onChange, label, size = "regular" }: Props) {
  return (
    <div
      className={size === "small" ? `${styles.qty} ${styles.small}` : styles.qty}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
