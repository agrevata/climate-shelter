import { NextResponse } from "next/server";
import { readWokwi } from "@/lib/wokwi-local";
import { httpError, HttpError } from "@/lib/request";
import { wokwiLocationSchema } from "../../../../../shared/wokwi";
import { isDemo } from "@/lib/env";
import { loadDashboard } from "@/lib/data";
export async function GET(request: Request) {
  try {
    const location = wokwiLocationSchema.safeParse(new URL(request.url).searchParams.get("location") ?? "shelter");
    if (!location.success) throw new HttpError("Lokasi tidak dikenal.", 400);
    const state = isDemo ? readWokwi(location.data) : (await loadDashboard()).wokwiLocations?.find(s=>s.location.id===location.data);
    if (!state?.enabled) throw new HttpError("Controller tidak tersedia untuk akun ini.", 404);
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return httpError(e); }
}
