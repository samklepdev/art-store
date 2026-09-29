import Link from "next/link";
import { site } from "@/lib/site";
import { logout } from "./admin/actions";
import styles from "./layout.module.css";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Link href="/admin" className={styles.brand}>
          {site.name} admin
        </Link>
        <nav className={styles.nav}>
          <Link href="/admin">Products</Link>
          <Link href="/">View store</Link>
          <form action={logout}>
            <button type="submit" className={styles.linkButton}>
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
