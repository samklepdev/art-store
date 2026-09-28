"use client";

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import Image from "next/image";
import type { ProductImage } from "@/lib/types";
import styles from "./Lightbox.module.css";

const SWIPE_THRESHOLD = 50;
const SIZES = "100vw";

type Props = {
  images: ProductImage[];
  index: number;
  title: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

/**
 * Full-screen image viewer on the native <dialog> element: focus trapping,
 * Escape to close and top-layer stacking come built in. Arrow keys, the
 * on-screen arrows and swipes move between images.
 */
export function Lightbox({ images, index, title, onIndexChange, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const justSwiped = useRef(false);

  const count = images.length;
  const image = images[index];
  const neighbours = [images[(index - 1 + count) % count], images[(index + 1) % count]].filter(
    (img, i, list) => img.id !== image.id && list.findIndex((b) => b.id === img.id) === i,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function go(delta: number) {
    if (count > 1) onIndexChange((index + delta + count) % count);
  }

  function requestClose() {
    dialogRef.current?.close(); // fires the close event -> onClose
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  }

  function handleClick(e: MouseEvent<HTMLDialogElement>) {
    if (justSwiped.current) {
      justSwiped.current = false;
      return;
    }
    const target = e.target as HTMLElement;
    if (target === e.currentTarget || target.dataset.dismiss !== undefined) requestClose();
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") swipeStart.current = { x: e.clientX, y: e.clientY };
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      justSwiped.current = true;
      go(dx < 0 ? 1 : -1);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label={`${title}, images`}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
    >
      <div className={styles.bar}>
        <p className={styles.counter} aria-live="polite">
          <span>{title}</span>
          {count > 1 && <span className={styles.position}>{index + 1} of {count}</span>}
        </p>
        <button type="button" className={styles.close} onClick={requestClose} aria-label="Close viewer">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        className={styles.stage}
        data-dismiss=""
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        <Image
          key={image.id}
          src={image.url}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes={SIZES}
          quality={90}
          loading="eager"
          draggable={false}
          className={styles.image}
        />

        {count > 1 && (
          <>
            <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => go(-1)} aria-label="Previous image">
              <Chevron direction="left" />
            </button>
            <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => go(1)} aria-label="Next image">
              <Chevron direction="right" />
            </button>
          </>
        )}
      </div>

      <div className={styles.preload} aria-hidden="true">
        {neighbours.map((img) => (
          <Image key={img.id} src={img.url} alt="" width={img.width} height={img.height} sizes={SIZES} quality={90} loading="eager" />
        ))}
      </div>
    </dialog>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
