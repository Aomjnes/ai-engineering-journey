import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, parseBody } from "@/lib/http";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";

const view = (s: { id: string; code: string; label: string; createdAt: Date; lastActiveAt: Date }) => ({ id: s.id, code: s.code, label: s.label, createdAt: s.createdAt, lastActiveAt: s.lastActiveAt });

/** The current stream only — other streams are never listed or exposed. */
export async function GET(req: Request) {
  return handle(async () => NextResponse.json({ stream: view(await requireStream(req)) }));
}

const Patch = z.object({ label: z.string().trim().min(1).max(40) });

/** Renames the label; the access code itself can never be changed here. */
export async function PATCH(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const { label } = await parseBody(req, Patch);
    const updated = await prisma.streamAccount.update({ where: { id: stream.id }, data: { label } });
    return NextResponse.json({ stream: view(updated) });
  });
}
