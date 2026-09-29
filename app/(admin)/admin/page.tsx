import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Products" };

export default async function AdminHome() {
  await requireAdmin();
  return <h1>Products</h1>;
}
