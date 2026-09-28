// Browser helper: asks the server for a Stripe Checkout URL and goes there.
// Returns an error message to show, or null when the redirect is under way.
export async function startCheckout(
  items: { variantId: number; quantity: number }[],
): Promise<string | null> {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && data.url) {
      window.location.assign(data.url);
      return null;
    }
    return data.error ?? "Checkout couldn't start. Try again in a moment.";
  } catch {
    return "Checkout couldn't start. Check your connection and try again.";
  }
}
