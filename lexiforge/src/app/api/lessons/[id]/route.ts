import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { lessonView } from "@/lib/lessons/flow";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const stream = await requireStream(req);
    return NextResponse.json(await lessonView(stream.id, id));
  });
}
