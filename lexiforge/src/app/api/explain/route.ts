import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { explainSelection } from "@/lib/explain/service";

export const dynamic = "force-dynamic";

const Body = z.object({ selection: z.string().trim().min(1).max(500), context: z.string().max(3000).default("") });

export async function POST(req: Request) {
  return handle(async () => {
    const { selection, context } = await parseBody(req, Body);
    return NextResponse.json(await explainSelection(selection, context || selection));
  });
}
