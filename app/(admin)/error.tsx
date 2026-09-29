"use client";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" style={{ padding: "2rem 0" }}>
      <h1>Something went wrong</h1>
      <p>The admin hit an error. Your last change may not have saved.</p>
      <button type="button" className="btn btn-secondary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
