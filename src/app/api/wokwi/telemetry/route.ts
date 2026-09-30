import { NextResponse } from "next/server";
import { authorizeWokwi, saveWokwi, readWokwi } from "@/lib/wokwi-local";
import { httpError, readJson, HttpError, localRateLimit } from "@/lib/request";
import { wokwiTelemetrySchema } from "../../../../../shared/wokwi";
import { isDemo } from "@/lib/env";
import { authenticateDevice } from "@/lib/device-auth";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    const result = wokwiTelemetrySchema.safeParse(await readJson(request));
    if (!result.success) throw new HttpError("Telemetry simulator tidak valid.", 400);
    if (!isDemo) {
      const {db,deviceId}=await authenticateDevice(request);
      const {data,error}=await db.rpc("ingest_wokwi_telemetry",{p_device:deviceId,p:result.data});
      if(error) throw new HttpError("Telemetry ditolak. Periksa key ESP32, lokasi, dan message_id.",error.code==="28000" ? 403 : 409);
      return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
    }
    authorizeWokwi(request);
    localRateLimit("wokwi-ingest", 60);
    const sample = saveWokwi(result.data);
    return NextResponse.json({ ok: true, message_id: sample.message_id, server_time: sample.received_at,
      location_id: sample.location_id, setpoint: readWokwi(sample.location_id).requestedSetpoint }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return httpError(e); }
}
