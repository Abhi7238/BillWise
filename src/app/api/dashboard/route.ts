import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getDashboardData());
  } catch (error) {
    console.error("Unable to load billing dashboard:", error);
    return NextResponse.json(
      { error: "Unable to load billing data." },
      { status: 500 },
    );
  }
}
