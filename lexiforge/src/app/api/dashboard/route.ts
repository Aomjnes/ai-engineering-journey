import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { dashboardData } from "@/lib/dashboard/service";
import { getLocalUser } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await getLocalUser();
    return NextResponse.json(await dashboardData(user.id, new Date()));
  });
}
