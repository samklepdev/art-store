"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import type { AdminVariant } from "@/lib/admin/variants";
import { deleteVariantAction, saveVariantAction, type ActionResult } from "../../actions";
import form from "../../form.module.css";
import styles from "./variants.module.css";

function VariantRow({
  productId,
  variant,
  onDone,
}: {
  productId: number;
  variant: AdminVariant | null;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const result = await saveVariantAction(previous, formData);
      if (result.ok) onDone?.();
      return result;
    },
    null,
  );
  const [madeToOrder, setMadeToOrder] = useState(variant ? variant.inventory === null : false);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    <form action={formAction} onChange={() => setEdited(true)} className={styles.row}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="id" value={variant?.id ?? ""} />

      <div className={styles.cells}>
        <div className={form.field}>
          <label className={form.label} htmlFor={`name-${variant?.id ?? "new"}`}>
            Format
          </label>
          <input
            id={`name-${variant?.id ?? "new"}`}
            name="name"
            required
            placeholder="Original"
            defaultValue={variant?.name ?? ""}
            className={form.input}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`kind-${variant?.id ?? "new"}`}>
            Kind
          </label>
          <select
            id={`kind-${variant?.id ?? "new"}`}
            name="kind"
            defaultValue={variant?.kind ?? "print"}
            className={form.select}
          >
            <option value="original">Original</option>
            <option value="print">Print</option>
          </select>
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`price-${variant?.id ?? "new"}`}>
            Price
          </label>
          <input
            id={`price-${variant?.id ?? "new"}`}
            name="price"
            required
            inputMode="decimal"
            placeholder="220.00"
            defaultValue={variant ? (variant.priceCents / 100).toFixed(2) : ""}
            className={form.input}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`compareAt-${variant?.id ?? "new"}`}>
            Compare at
          </label>
          <input
            id={`compareAt-${variant?.id ?? "new"}`}
            name="compareAt"
            inputMode="decimal"
            defaultValue={
              variant?.compareAtCents != null ? (variant.compareAtCents / 100).toFixed(2) : ""
            }
            className={form.input}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`inventory-${variant?.id ?? "new"}`}>
            In stock
          </label>
          <input
            id={`inventory-${variant?.id ?? "new"}`}
            name="inventory"
            type="number"
            min={0}
            disabled={madeToOrder}
            defaultValue={variant?.inventory ?? 0}
            className={form.input}
          />
          <div className={form.checkboxRow}>
            <input
              id={`madeToOrder-${variant?.id ?? "new"}`}
              name="madeToOrder"
              type="checkbox"
              checked={madeToOrder}
              onChange={(event) => setMadeToOrder(event.target.checked)}
            />
            <label htmlFor={`madeToOrder-${variant?.id ?? "new"}`}>Made to order</label>
          </div>
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`sku-${variant?.id ?? "new"}`}>
            SKU
          </label>
          <input
            id={`sku-${variant?.id ?? "new"}`}
            name="sku"
            defaultValue={variant?.sku ?? ""}
            className={form.input}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`position-${variant?.id ?? "new"}`}>
            Position
          </label>
          <input
            id={`position-${variant?.id ?? "new"}`}
            name="position"
            type="number"
            defaultValue={variant?.position ?? 0}
            className={form.input}
          />
        </div>
      </div>

      <div className={form.actions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : variant ? "Save format" : "Add format"}
        </button>
        {variant && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={deleting}
            onClick={() =>
              startDelete(async () => {
                const result = await deleteVariantAction(variant.id);
                setDeleteError(result.ok ? null : result.error);
              })
            }
          >
            {deleting ? "Removing…" : "Remove"}
          </button>
        )}
        {state?.ok && <p className={form.success}>Saved.</p>}
        {error && (
          <p className={form.error} role="alert">
            {error.error}
          </p>
        )}
        {deleteError && (
          <p className={form.error} role="alert">
            {deleteError}
          </p>
        )}
      </div>

      {variant && (
        <p className={form.hint}>
          Shows as {formatMoney(variant.priceCents)}
          {variant.inventory === null
            ? ", made to order"
            : variant.inventory === 0
              ? ", sold out"
              : `, ${variant.inventory} in stock`}
        </p>
      )}
    </form>
  );
}

export function VariantsSection({
  productId,
  variants,
}: {
  productId: number;
  variants: AdminVariant[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className={form.section}>
      <h2 className={form.sectionHeading}>Formats</h2>
      <p className={form.hint}>
        One row per purchasable option. Use “Made to order” for prints with no stock limit —
        that stores no quantity at all, which is different from 0 (sold out).
      </p>

      {variants.length === 0 && !adding && (
        <p>No formats yet. Add the original, then any print sizes.</p>
      )}

      {variants.map((variant) => (
        <VariantRow key={variant.id} productId={productId} variant={variant} />
      ))}

      {adding ? (
        <VariantRow productId={productId} variant={null} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
          Add a format
        </button>
      )}
    </section>
  );
}
