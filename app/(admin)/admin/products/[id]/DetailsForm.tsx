"use client";

import { useActionState, useEffect, useState } from "react";
import type { AdminProduct } from "@/lib/admin/products";
import { updateProductAction, type ActionResult } from "../../actions";
import styles from "../../form.module.css";

export function DetailsForm({
  product,
  collections,
}: {
  product: AdminProduct;
  collections: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateProductAction,
    null,
  );
  // `state` only changes on a server response, so gate the error on whether the
  // user has edited since: otherwise a message keeps describing a value that is
  // no longer on screen. One onChange on the <form> covers every field, since
  // React change events bubble.
  //
  // The gate is reset by an effect on `state` rather than by wrapping formAction
  // in a closure. `action` must stay bound to the server action itself: React
  // renders that as a real endpoint in the DOM's action attribute, so the form
  // still submits before JS hydrates. A wrapped closure cannot be serialised
  // that way and silently costs progressive enhancement.
  const [edited, setEdited] = useState(false);
  useEffect(() => setEdited(false), [state]);
  const error = !edited && state && !state.ok ? state : null;

  return (
    <form action={formAction} onChange={() => setEdited(true)} className={styles.section}>
      <h2 className={styles.sectionHeading}>Details</h2>
      <input type="hidden" name="id" value={product.id} />

      <div className={styles.grid}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="title">
            Title
          </label>
          <input id="title" name="title" required defaultValue={product.title} className={styles.input} />
          {error?.field === "title" && (
            <p className={styles.error} role="alert">
              {error.error}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="slug">
            Web address
          </label>
          <input id="slug" name="slug" required defaultValue={product.slug} className={styles.input} />
          {error?.field === "slug" && (
            <p className={styles.error} role="alert">
              {error.error}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="year">
            Year
          </label>
          <input
            id="year"
            name="year"
            type="number"
            min={1900}
            max={2100}
            defaultValue={product.year ?? ""}
            className={styles.input}
          />
          {error?.field === "year" && (
            <p className={styles.error} role="alert">
              {error.error}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="medium">
            Medium
          </label>
          <input
            id="medium"
            name="medium"
            placeholder="Oil on linen"
            defaultValue={product.medium ?? ""}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="dimensions">
            Dimensions
          </label>
          <input
            id="dimensions"
            name="dimensions"
            placeholder="76 × 61 cm"
            defaultValue={product.dimensions ?? ""}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="collection">
            Collection
          </label>
          <input
            id="collection"
            name="collection"
            list="collection-names"
            defaultValue={product.collection ?? ""}
            className={styles.input}
          />
          <datalist id="collection-names">
            {collections.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className={styles.hint}>Pick an existing name to avoid near-duplicates.</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="sortOrder">
            Sort order
          </label>
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            defaultValue={product.sortOrder}
            className={styles.input}
          />
          {error?.field === "sortOrder" && (
            <p className={styles.error} role="alert">
              {error.error}
            </p>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={product.description ?? ""}
          className={styles.textarea}
        />
      </div>

      <div className={styles.checkboxRow}>
        <input id="published" name="published" type="checkbox" defaultChecked={product.published} />
        <label htmlFor="published">Published — visible in the shop</label>
      </div>

      <div className={styles.checkboxRow}>
        <input id="featured" name="featured" type="checkbox" defaultChecked={product.featured} />
        <label htmlFor="featured">Featured on the home page</label>
      </div>

      <div className={styles.actions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </button>
        {state?.ok && <p className={styles.success}>Saved.</p>}
        {error && !error.field && (
          <p className={styles.error} role="alert">
            {error.error}
          </p>
        )}
      </div>
    </form>
  );
}
