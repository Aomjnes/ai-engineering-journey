import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { lessonView } from "@/lib/lessons/flow";
import { getLocalUser } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await getLocalUser();
    return NextResponse.json(await lessonView(user.id, id));
  });
}
