"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPassword, endSession, requireAdmin, startSession } from "@/lib/admin/auth";
import { messageForDbError } from "@/lib/admin/errors";
import { createProduct, setFeatured, setPublished, slugForId } from "@/lib/admin/products";
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

export async function togglePublished(id: number, published: boolean): Promise<void> {
  await requireAdmin();
  await setPublished(id, published);
  const slug = await slugForId(id);
  await revalidateStorefront(slug ? [slug] : []);
  revalidatePath("/admin");
}

export async function toggleFeatured(id: number, featured: boolean): Promise<void> {
  await requireAdmin();
  await setFeatured(id, featured);
  const slug = await slugForId(id);
  await revalidateStorefront(slug ? [slug] : []);
  revalidatePath("/admin");
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
