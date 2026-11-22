import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { isSecureRequest, requireStream } from "@/lib/auth/stream";
import { resetStreamData } from "@/lib/stream/reset";
import { isLocale, localeCookie } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const Body = z.object({ confirmCode: z.string().min(1).max(40), preserveLanguage: z.boolean().optional() });

/** Wipes ALL learning data of the authenticated stream only. The session stays valid. */
export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const body = await parseBody(req, Body);
    const result = await resetStreamData(stream, body);
    const res = NextResponse.json({ ok: true, ...result });
    if (isLocale(result.preservedLanguage)) res.headers.append("Set-Cookie", localeCookie(result.preservedLanguage, isSecureRequest(req)));
    res.headers.set("Cache-Control", "no-store");
    return res;
  });
}
