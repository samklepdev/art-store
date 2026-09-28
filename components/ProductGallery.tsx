"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { ProductImage } from "@/lib/types";
import { Lightbox } from "./Lightbox";
import styles from "./ProductGallery.module.css";

export function ProductGallery({ images, title }: { images: ProductImage[]; title: string }) {
  const [active, setActive] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const mainRef = useRef<HTMLButtonElement>(null);
  const image = images[active];

  if (!image) return <div className={styles.placeholder}>Image coming soon</div>;

  return (
    <div className={styles.gallery}>
      <button
        ref={mainRef}
        type="button"
        className={styles.main}
        onClick={() => setViewerOpen(true)}
        aria-label={`Open ${title} full screen`}
      >
        <Image
          key={image.id}
          src={image.url}
          alt={image.alt}
          fill
          sizes="(min-width: 56rem) 55vw, 100vw"
          quality={90}
          loading="eager"
          fetchPriority="high"
          className={styles.image}
        />
        <span className={styles.zoom} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {images.length > 1 && (
        <ul className={styles.thumbs}>
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                className={styles.thumb}
                aria-current={i === active}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                onClick={() => setActive(i)}
              >
                <Image src={img.url} alt="" fill sizes="5.5rem" className={styles.image} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewerOpen && (
        <Lightbox
          images={images}
          index={active}
          title={title}
          onIndexChange={setActive}
          onClose={() => {
            setViewerOpen(false);
            requestAnimationFrame(() => mainRef.current?.focus());
          }}
        />
      )}
    </div>
  );
}
