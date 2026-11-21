import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { accountabilityStatus, completeDetox, detoxExamples, errorGraveyard, startDetox, submitDetoxRewrite } from "@/lib/accountability/service";
import { getLocalUser } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await getLocalUser();
    const now = new Date();
    const status = await accountabilityStatus(user.id, now);
    const examples = status.detox
      ? Object.fromEntries(await Promise.all(status.detox.targets.map(async (t) => [t.subtype, await detoxExamples(user.id, t.subtype)] as const)))
      : {};
    return NextResponse.json({ status, graveyard: await errorGraveyard(user.id), examples });
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("rewrite"), subtype: z.string().min(1).max(60), text: z.string().max(3000) }),
  z.object({ action: z.literal("complete") }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, Body);
    const user = await getLocalUser();
    const now = new Date();
    switch (body.action) {
      case "start":
        return NextResponse.json(await startDetox(user.id, now));
      case "rewrite":
        return NextResponse.json(await submitDetoxRewrite(user.id, body.subtype, body.text, now));
      case "complete":
        return NextResponse.json(await completeDetox(user.id, now));
    }
  });
}
