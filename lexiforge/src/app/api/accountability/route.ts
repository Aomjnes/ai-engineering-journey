import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { accountabilityStatus, completeDetox, detoxExamples, errorGraveyard, repairPattern, startDetox, submitDetoxRewrite } from "@/lib/accountability/service";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const now = new Date();
    const status = await accountabilityStatus(stream.id, now);
    const examples = status.detox
      ? Object.fromEntries(await Promise.all(status.detox.targets.map(async (t) => [t.subtype, await detoxExamples(stream.id, t.subtype)] as const)))
      : {};
    return NextResponse.json({ status, graveyard: await errorGraveyard(stream.id), examples });
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("rewrite"), subtype: z.string().min(1).max(60), text: z.string().max(3000) }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("drill"), subtype: z.string().min(1).max(60), sentences: z.array(z.string().max(600)).length(3) }),
  z.object({ action: z.literal("examples"), subtype: z.string().min(1).max(60) }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const body = await parseBody(req, Body);
    const now = new Date();
    switch (body.action) {
      case "start":
        return NextResponse.json(await startDetox(stream.id, now));
      case "rewrite":
        return NextResponse.json(await submitDetoxRewrite(stream.id, body.subtype, body.text, now));
      case "complete":
        return NextResponse.json(await completeDetox(stream.id, now));
      case "drill":
        return NextResponse.json(await repairPattern(stream.id, body.subtype, body.sentences.map((x) => x.trim()).join("\n"), now));
      case "examples":
        return NextResponse.json({ examples: await detoxExamples(stream.id, body.subtype) });
    }
  });
}
