"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import type { AdminImage } from "@/lib/admin/images";
import {
  addImageAction,
  deleteImageAction,
  moveImageAction,
  updateAltAction,
  type ActionResult,
} from "../../actions";
import form from "../../form.module.css";
import styles from "./images.module.css";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

/** Reads pixel dimensions in the browser. These are layout hints, not a
 *  security boundary, so client-supplied values are fine — and it saves you
 *  running `sips` by hand. */
async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function ImageCard({ image, last }: { image: AdminImage; last: boolean }) {
  const [pending, start] = useTransition();
  const [alt, setAlt] = useState(image.alt);
  const [failed, setFailed] = useState(false);

  // Hand the promise to startTransition rather than discarding it with `void`:
  // React only holds a transition pending while the callback's thenable is
  // unsettled, so a synchronous `undefined` ends it at once and `pending` never
  // shows. Deliberately no try/catch — these actions call requireAdmin(), which
  // redirects on an expired session, and a catch here would swallow that
  // navigation. Expected failures arrive as a returned ActionResult.
  const run = (action: () => Promise<ActionResult>) =>
    start(async () => {
      setFailed(false);
      const result = await action();
      setFailed(!result.ok);
    });

  return (
    <li className={styles.card} data-pending={pending || undefined}>
      <Image
        src={image.url}
        alt={alt}
        width={image.width}
        height={image.height}
        className={styles.preview}
        sizes="200px"
      />
      <div className={form.field}>
        <label className={form.label} htmlFor={`alt-${image.id}`}>
          Alt text
        </label>
        <input
          id={`alt-${image.id}`}
          className={form.input}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          onBlur={() => {
            if (alt !== image.alt) run(() => updateAltAction(image.id, alt));
          }}
        />
        <p className={form.hint}>
          {image.width} × {image.height} px
          {image.position === 0 && " · main image"}
        </p>
        {failed && (
          <p className={form.error} role="alert">
            That didn&rsquo;t save. Try again.
          </p>
        )}
      </div>
      <div className={styles.cardActions}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending || image.position === 0}
          onClick={() => run(() => moveImageAction(image.id, "up"))}
        >
          ↑<span className="visually-hidden"> Move earlier</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending || last}
          onClick={() => run(() => moveImageAction(image.id, "down"))}
        >
          ↓<span className="visually-hidden"> Move later</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => deleteImageAction(image.id))}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export function ImagesSection({
  productId,
  images,
}: {
  productId: number;
  images: AdminImage[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const { width, height } = await readDimensions(file);

        const presignResponse = await fetch("/api/admin/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, contentType: file.type, size: file.size }),
        });
        const presigned = await presignResponse.json();
        if (!presignResponse.ok) throw new Error(presigned.error ?? "Could not start the upload.");

        const put = await fetch(presigned.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("The upload to storage failed. Check the bucket CORS rules.");

        const saved = await addImageAction({
          productId,
          url: presigned.publicUrl,
          width,
          height,
          alt: "",
        });
        if (!saved.ok) throw new Error(saved.error);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={form.section}>
      <h2 className={form.sectionHeading}>Images</h2>
      <p className={form.hint}>
        The first image is the main one; the second shows on hover in the shop grid. Dimensions
        are read from the file automatically.
      </p>

      {images.length === 0 ? (
        <p>No images yet.</p>
      ) : (
        <ul className={styles.grid}>
          {images.map((image, index) => (
            <ImageCard key={image.id} image={image} last={index === images.length - 1} />
          ))}
        </ul>
      )}

      <div className={form.field}>
        <label className={form.label} htmlFor="upload">
          Add images
        </label>
        <input
          id="upload"
          type="file"
          accept={ACCEPT}
          multiple
          disabled={busy}
          onChange={(event) => {
            void upload(event.target.files);
            event.target.value = "";
          }}
        />
        {busy && <p className={form.hint}>Uploading…</p>}
        {error && (
          <p className={form.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
