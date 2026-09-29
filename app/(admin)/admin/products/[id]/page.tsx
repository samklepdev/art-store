import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getProductForAdmin, listCollectionNames } from "@/lib/admin/products";
import { DetailsForm } from "./DetailsForm";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const [product, collections] = await Promise.all([
    getProductForAdmin(id),
    listCollectionNames(),
  ]);
  if (!product) notFound();

  return (
    <>
      <h1>{product.title}</h1>
      <p>
        <Link href={`/products/${product.slug}`}>View on the storefront</Link>
      </p>
      <DetailsForm product={product} collections={collections} />
    </>
  );
}
