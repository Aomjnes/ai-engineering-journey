import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { dashboardData } from "@/lib/dashboard/service";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    return NextResponse.json(await dashboardData(stream.id, new Date()));
  });
}
