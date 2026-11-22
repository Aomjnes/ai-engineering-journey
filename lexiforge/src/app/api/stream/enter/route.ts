import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { clientIp, enterStream, isSecureRequest } from "@/lib/auth/stream";
import { sessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isLocale, localeCookie } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().trim().min(1).max(64) });

/** Validates a private access code, creates the stream lazily (max 5) and sets the signed session cookie. */
export async function POST(req: Request) {
  return handle(async () => {
    const { code } = await parseBody(req, Body);
    const { stream, token } = await enterStream(code, clientIp(req));
    const res = NextResponse.json({ stream: { code: stream.code, label: stream.label } });
    res.headers.append("Set-Cookie", sessionCookie(token, isSecureRequest(req)));
    // The stream's saved UI language wins on every device.
    const settings = await prisma.userSettings.findUnique({ where: { streamId: stream.id }, select: { uiLocale: true } });
    if (isLocale(settings?.uiLocale)) res.headers.append("Set-Cookie", localeCookie(settings.uiLocale, isSecureRequest(req)));
    res.headers.set("Cache-Control", "no-store");
    return res;
  });
}
