"use client";

import { useEffect } from "react";
import { useCart } from "./CartProvider";

/** Empties the cart once, after a confirmed order. */
export function ClearCart() {
  const { ready, clear } = useCart();
  useEffect(() => {
    if (ready) clear();
  }, [ready, clear]);
  return null;
}
