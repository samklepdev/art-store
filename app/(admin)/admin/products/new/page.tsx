import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { NewProductForm } from "./NewProductForm";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin();
  return (
    <>
      <h1>New product</h1>
      <p>Give it a title now; add formats, images and details on the next screen.</p>
      <NewProductForm />
    </>
  );
}
