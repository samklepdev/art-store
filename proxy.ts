// Next.js 16 renamed the `middleware` file convention to `proxy` (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// Logic below is otherwise exactly the brief's middleware.ts, with the export
// renamed from `middleware` to `proxy` per the new convention. Proxy defaults
// to the Node.js runtime in this version, but lib/admin/session.ts stays
// Web-Crypto-only and import-free regardless, so it works under either
// runtime unchanged.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/admin/session";

export async function proxy(request: NextRequest) {
  // The login page itself must stay reachable or this redirects forever.
  if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();

  const secret = process.env.ADMIN_SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (secret && token && (await verifySession(token, secret))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*"] };
