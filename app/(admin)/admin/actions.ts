"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPassword, endSession, requireAdmin, startSession } from "@/lib/admin/auth";
import { messageForDbError } from "@/lib/admin/errors";
import {
  createProduct,
  getProductForAdmin,
  listCollectionNames,
  setFeatured,
  setPublished,
  slugForId,
  updateProduct,
} from "@/lib/admin/products";
import { slugify } from "@/lib/admin/slug";

export type ActionResult = { ok: true } | { ok: false; error: string; field?: string };

export async function login(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const password = String(formData.get("password") ?? "");

  if (!checkPassword(password)) {
    // There is no meaningful rate limiting here; a fixed delay is the honest
    // mitigation alongside a strong password.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { ok: false, error: "Incorrect password.", field: "password" };
  }

  await startSession();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}

/**
 * Refreshes every storefront path a product change can affect. Pass both the
 * old and new slug when a slug changes, or the old URL keeps serving stale HTML.
 *
 * NOT exported: every export from a "use server" module is a callable POST
 * endpoint, and this helper has no requireAdmin() guard of its own. It is used
 * only from actions in this file.
 */
async function revalidateStorefront(slugs: string[]): Promise<void> {
  revalidatePath("/");
  revalidatePath("/shop");
  for (const slug of slugs) revalidatePath(`/products/${slug}`);
}

// requireAdmin() stays outside the try: it redirects when the session has
// expired, and redirect() works by throwing, so a try around it would swallow
// the navigation. Expected failures are returned as data, never thrown, so the
// client never needs a catch that could suppress that redirect.
export async function togglePublished(id: number, published: boolean): Promise<ActionResult> {
  await requireAdmin();
  try {
    await setPublished(id, published);
    const slug = await slugForId(id);
    await revalidateStorefront(slug ? [slug] : []);
  } catch (error) {
    return { ok: false, error: messageForDbError(error) ?? "Couldn't update. Try again." };
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleFeatured(id: number, featured: boolean): Promise<ActionResult> {
  await requireAdmin();
  try {
    await setFeatured(id, featured);
    const slug = await slugForId(id);
    await revalidateStorefront(slug ? [slug] : []);
  } catch (error) {
    return { ok: false, error: messageForDbError(error) ?? "Couldn't update. Try again." };
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function createProductAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "A title is required.", field: "title" };

  const typedSlug = String(formData.get("slug") ?? "").trim();
  const slug = typedSlug || slugify(title);
  if (!slug) {
    return {
      ok: false,
      error: "Add a web address — the title has no letters or numbers to build one from.",
      field: "slug",
    };
  }

  let id: number;
  try {
    id = await createProduct(title, slug);
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message, field: "slug" };
    throw error;
  }

  await revalidateStorefront([slug]);
  revalidatePath("/admin");
  redirect(`/admin/products/${id}`);
}

function optionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

export async function updateProductAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "Unknown product." };

  const existing = await getProductForAdmin(id);
  if (!existing) return { ok: false, error: "That product no longer exists." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "A title is required.", field: "title" };

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return { ok: false, error: "A web address is required.", field: "slug" };

  const yearRaw = String(formData.get("year") ?? "").trim();
  let year: number | null = null;
  if (yearRaw !== "") {
    year = Number(yearRaw);
    if (!Number.isInteger(year)) {
      return { ok: false, error: "The year must be a whole number.", field: "year" };
    }
  }

  const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();
  const sortOrder = sortOrderRaw === "" ? 0 : Number(sortOrderRaw);
  if (!Number.isInteger(sortOrder)) {
    return { ok: false, error: "Sort order must be a whole number.", field: "sortOrder" };
  }

  try {
    await updateProduct(id, {
      title,
      slug,
      year,
      medium: optionalText(formData, "medium"),
      dimensions: optionalText(formData, "dimensions"),
      description: optionalText(formData, "description"),
      collection: optionalText(formData, "collection"),
      featured: formData.get("featured") === "on",
      published: formData.get("published") === "on",
      sortOrder,
    });
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message };
    throw error;
  }

  // Both slugs: the old URL would otherwise keep serving stale HTML.
  const slugs = existing.slug === slug ? [slug] : [existing.slug, slug];
  await revalidateStorefront(slugs);
  revalidatePath("/admin");
  revalidatePath(`/admin/products/${id}`);
  return { ok: true };
}
