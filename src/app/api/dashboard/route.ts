import { NextResponse } from "next/server";
import { loadDashboard } from "@/lib/data";
import { httpError } from "@/lib/request";
export async function GET() {
  try {
    return NextResponse.json(await loadDashboard(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return httpError(e);
  }
}
