import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listAllProducts } from "@/lib/admin/products";
import { ProductRow } from "./ProductRow";
import styles from "./products.module.css";

export const metadata: Metadata = { title: "Products" };

export default async function AdminHome() {
  await requireAdmin();
  const products = await listAllProducts();

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.heading}>Products</h1>
        <Link href="/admin/products/new" className="btn btn-primary">
          New product
        </Link>
      </div>

      {products.length === 0 ? (
        <p>No products yet. Start with “New product”.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <span className="visually-hidden">Image</span>
                </th>
                <th>Title</th>
                <th>Collection</th>
                <th>Price</th>
                <th>Formats</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <ProductRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
