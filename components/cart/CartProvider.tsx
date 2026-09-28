"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { site } from "@/lib/site";

export type CartLine = {
  variantId: number;
  productSlug: string;
  productTitle: string;
  variantName: string;
  priceCents: number;
  imageUrl: string | null;
  imageAlt: string;
  /** null = no stock limit beyond site.maxQuantity */
  maxQuantity: number | null;
  quantity: number;
};

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  /** false until the saved cart has loaded from this browser */
  ready: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: number, quantity: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
};

const STORAGE_KEY = "cart:v1";
const CartContext = createContext<CartContextValue | null>(null);

function limitFor(line: Pick<CartLine, "maxQuantity">) {
  return Math.min(line.maxQuantity ?? site.maxQuantity, site.maxQuantity);
}

function readSaved(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Load the saved cart after hydration so server and client HTML match.
  useEffect(() => {
    try {
      setLines(readSaved(localStorage.getItem(STORAGE_KEY)));
    } catch {
      // Storage blocked (private mode, etc.): cart just won't persist.
    }
    setReady(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLines(readSaved(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // ignore
    }
  }, [lines, ready]);

  const add = useCallback((item: Omit<CartLine, "quantity">, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === item.variantId);
      const next = Math.min((existing?.quantity ?? 0) + quantity, limitFor(item));
      if (existing) {
        return prev.map((l) => (l.variantId === item.variantId ? { ...l, ...item, quantity: next } : l));
      }
      return [...prev, { ...item, quantity: next }];
    });
    setIsOpen(true);
  }, []);

  const setQuantity = useCallback((variantId: number, quantity: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.variantId === variantId
          ? { ...l, quantity: Math.max(1, Math.min(quantity, limitFor(l))) }
          : l,
      ),
    );
  }, []);

  const remove = useCallback((variantId: number) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setLines([]), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotalCents: lines.reduce((n, l) => n + l.priceCents * l.quantity, 0),
      ready,
      isOpen,
      open,
      close,
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, ready, isOpen, open, close, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart must be used inside <CartProvider>");
  return cart;
}

export function cartLimit(line: Pick<CartLine, "maxQuantity">) {
  return limitFor(line);
}
