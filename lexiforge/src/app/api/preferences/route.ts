import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, parseBody } from "@/lib/http";
import { isSecureRequest, requireStream } from "@/lib/auth/stream";
import { localeCookie } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const Body = z.object({ uiLocale: z.enum(["vi", "en"]) });

/** Saves the stream's UI/feedback language and mirrors it in the locale cookie. */
export async function PATCH(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const { uiLocale } = await parseBody(req, Body);
    await prisma.userSettings.upsert({ where: { streamId: stream.id }, update: { uiLocale }, create: { streamId: stream.id, uiLocale } });
    const res = NextResponse.json({ uiLocale });
    res.headers.append("Set-Cookie", localeCookie(uiLocale, isSecureRequest(req)));
    return res;
  });
}
