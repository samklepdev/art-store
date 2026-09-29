"use client";

import { useActionState } from "react";
import { login, type ActionResult } from "../actions";
import styles from "./login.module.css";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(login, null);

  return (
    <form action={formAction} className={styles.form}>
      <h1 className={styles.heading}>Sign in</h1>
      <label className={styles.label} htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        className={styles.input}
        aria-describedby={state && !state.ok ? "password-error" : undefined}
      />
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state && !state.ok && (
        <p id="password-error" className={styles.error} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
