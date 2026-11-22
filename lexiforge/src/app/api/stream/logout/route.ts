import { NextResponse } from "next/server";
import { isSecureRequest } from "@/lib/auth/stream";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie(isSecureRequest(req)));
  return res;
}
