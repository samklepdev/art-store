"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPassword, endSession, requireAdmin, startSession } from "@/lib/admin/auth";
import { messageForDbError } from "@/lib/admin/errors";
import {
  addImage,
  applyImagePositions,
  deleteImage,
  listImages,
  productIdForImage,
  updateImageAlt,
} from "@/lib/admin/images";
import {
  createProduct,
  getProductForAdmin,
  listCollectionNames,
  setFeatured,
  setPublished,
  slugForId,
  updateProduct,
} from "@/lib/admin/products";
import { moveItem } from "@/lib/admin/reorder";
import { setOrderStatus } from "@/lib/admin/orders";
import { isSettableStatus, type SettableStatus } from "@/lib/admin/orderStatus";
import { slugify } from "@/lib/admin/slug";
import { readVariantInput } from "@/lib/admin/variantInput";
import {
  countOrderItems,
  createVariant,
  deleteVariant,
  productIdForVariant,
  updateVariant,
} from "@/lib/admin/variants";

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

export async function saveVariantAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const productId = Number(formData.get("productId"));
  if (!Number.isInteger(productId) || productId <= 0) {
    return { ok: false, error: "Unknown product." };
  }

  const parsed = readVariantInput(formData);
  if ("ok" in parsed) return parsed;

  const idRaw = String(formData.get("id") ?? "").trim();

  try {
    if (idRaw === "") {
      await createVariant(productId, parsed);
    } else {
      const id = Number(idRaw);
      if (!Number.isInteger(id)) return { ok: false, error: "Unknown format." };
      // The client's hidden `productId` field only drives revalidation. Trusting
      // it for that without checking it against the variant's real parent would
      // let an edit to a variant of another product revalidate the wrong
      // storefront page, leaving the real product serving stale cached HTML.
      const realProductId = await productIdForVariant(id);
      if (realProductId === null || realProductId !== productId) {
        return { ok: false, error: "Unknown format." };
      }
      await updateVariant(id, parsed);
    }
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message };
    throw error;
  }

  const slug = await slugForId(productId);
  await revalidateStorefront(slug ? [slug] : []);
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteVariantAction(id: number): Promise<ActionResult> {
  await requireAdmin();

  // Mirrors the unpublish-only rule for products: never sever an order's link
  // to what was bought. Setting stock to 0 is how you retire a sold format.
  if ((await countOrderItems(id)) > 0) {
    return {
      ok: false,
      error:
        "This format has been ordered, so it can't be removed. Set its stock to 0 to stop selling it.",
    };
  }

  const productId = await productIdForVariant(id);
  try {
    await deleteVariant(id);
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message };
    throw error;
  }
  if (productId !== null) {
    const slug = await slugForId(productId);
    await revalidateStorefront(slug ? [slug] : []);
    revalidatePath(`/admin/products/${productId}`);
  }
  revalidatePath("/admin");
  return { ok: true };
}

async function revalidateProduct(productId: number): Promise<void> {
  const slug = await slugForId(productId);
  await revalidateStorefront(slug ? [slug] : []);
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin");
}

export async function addImageAction(input: {
  productId: number;
  url: string;
  width: number;
  height: number;
  alt: string;
}): Promise<ActionResult> {
  await requireAdmin();

  if (!Number.isInteger(input.productId)) return { ok: false, error: "Unknown product." };
  if (!Number.isInteger(input.width) || input.width <= 0) {
    return { ok: false, error: "The image width could not be read." };
  }
  if (!Number.isInteger(input.height) || input.height <= 0) {
    return { ok: false, error: "The image height could not be read." };
  }

  try {
    await addImage(input.productId, {
      url: input.url,
      width: input.width,
      height: input.height,
      alt: input.alt,
    });
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message };
    throw error;
  }

  await revalidateProduct(input.productId);
  return { ok: true };
}

export async function updateAltAction(id: number, alt: string): Promise<ActionResult> {
  await requireAdmin();

  try {
    await updateImageAlt(id, alt);
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message };
    throw error;
  }

  const productId = await productIdForImage(id);
  if (productId !== null) await revalidateProduct(productId);
  return { ok: true };
}

export async function deleteImageAction(id: number): Promise<ActionResult> {
  await requireAdmin();

  const productId = await productIdForImage(id);
  try {
    await deleteImage(id);
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message };
    throw error;
  }

  if (productId !== null) await revalidateProduct(productId);
  return { ok: true };
}

export async function moveImageAction(
  id: number,
  direction: "up" | "down",
): Promise<ActionResult> {
  await requireAdmin();

  const productId = await productIdForImage(id);
  if (productId === null) return { ok: true };

  const images = await listImages(productId);
  const positions = moveItem(images, id, direction);
  if (positions.length === 0) return { ok: true };

  try {
    await applyImagePositions(productId, positions);
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message };
    throw error;
  }

  await revalidateProduct(productId);
  return { ok: true };
}

export async function setOrderStatusAction(
  id: number,
  status: SettableStatus,
): Promise<ActionResult> {
  // requireAdmin() stays outside the try: it redirects on an expired session by
  // throwing, and a try here would swallow that navigation.
  await requireAdmin();

  if (!Number.isInteger(id)) return { ok: false, error: "Unknown order." };
  // The typed param is a compile-time hint only; a server action receives
  // untrusted input, so re-validate at the boundary.
  if (!isSettableStatus(status)) {
    return { ok: false, error: "That status can't be set here." };
  }

  try {
    await setOrderStatus(id, status);
  } catch (error) {
    return { ok: false, error: messageForDbError(error) ?? "Couldn't update. Try again." };
  }

  // Admin-only: no storefront revalidation. Order status never affects a
  // storefront page.
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  return { ok: true };
}
