import { NextResponse, type NextRequest } from "next/server";
import { STREAM_COOKIE, verifySession } from "@/lib/auth/session";

/** Routes reachable without a stream session. /api/cron/ingest authenticates with CRON_SECRET itself. */
const PUBLIC_PATHS = ["/access", "/api/stream/enter", "/api/stream/logout", "/api/cron/ingest"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const secret = process.env.SESSION_SECRET;
  const ok = secret && secret.length >= 32 ? await verifySession(req.cookies.get(STREAM_COOKIE)?.value, secret) : null;
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Enter your stream access code." } }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/access";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
