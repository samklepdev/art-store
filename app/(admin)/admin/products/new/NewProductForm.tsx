"use client";

import { useActionState, useState } from "react";
import { slugify } from "@/lib/admin/slug";
import { createProductAction, type ActionResult } from "../../actions";
import styles from "../../form.module.css";

export function NewProductForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createProductAction,
    null,
  );
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  // `state` only changes on a server response, so gate the error on whether the
  // user has edited since: otherwise a message keeps describing a value that is
  // no longer on screen. One onChange on the <form> covers every field, since
  // React change events bubble.
  const [edited, setEdited] = useState(false);
  const error = !edited && state && !state.ok ? state : null;

  const submit = (formData: FormData) => {
    setEdited(false);
    formAction(formData);
  };

  return (
    <form action={submit} onChange={() => setEdited(true)} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          autoFocus
          className={styles.input}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
        />
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
        <div className={styles.prefixed}>
          <span className={styles.prefix}>/products/</span>
          <input
            id="slug"
            name="slug"
            className={styles.input}
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
          />
        </div>
        <p className={styles.hint}>Lowercase letters, numbers and dashes only.</p>
        {error?.field === "slug" && (
          <p className={styles.error} role="alert">
            {error.error}
          </p>
        )}
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create draft"}
      </button>

      {error && !error.field && (
        <p className={styles.error} role="alert">
          {error.error}
        </p>
      )}
    </form>
  );
}
