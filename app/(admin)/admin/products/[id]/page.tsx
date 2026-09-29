import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getProductForAdmin, listCollectionNames } from "@/lib/admin/products";
import { listVariants } from "@/lib/admin/variants";
import { DetailsForm } from "./DetailsForm";
import { VariantsSection } from "./VariantsSection";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const [product, collections, variants] = await Promise.all([
    getProductForAdmin(id),
    listCollectionNames(),
    listVariants(id),
  ]);
  if (!product) notFound();

  return (
    <>
      <h1>{product.title}</h1>
      <p>
        <Link href={`/products/${product.slug}`}>View on the storefront</Link>
      </p>
      <DetailsForm product={product} collections={collections} />
      <VariantsSection productId={product.id} variants={variants} />
    </>
  );
}
