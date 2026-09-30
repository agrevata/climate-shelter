import { NextResponse } from "next/server";
import { iotSensorSchema } from "../../../../../shared/platform";
import { authenticateDevice } from "@/lib/device-auth";
import { readJson, httpError, HttpError } from "@/lib/request";
export async function POST(request: Request) {
  try {
    const p = iotSensorSchema.safeParse(await readJson(request));
    if (!p.success)
      throw new HttpError(
        "Payload sensor tidak valid: " + p.error.issues[0].path.join("."),
        400,
      );
    const { db, deviceId } = await authenticateDevice(request);
    const {data:controller,error:controllerError}=await db.from("wokwi_controllers").select("device_id").eq("device_id",deviceId).maybeSingle();
    if(controllerError) throw new HttpError("Pemetaan perangkat belum dapat diperiksa.",503);
    if(controller) throw new HttpError("ESP32 Wokwi memakai /api/wokwi/telemetry.",409);
    const { data, error } = await db.rpc("ingest_device_reading", {
      p_device: deviceId,
      p: p.data,
    });
    if (error)
      throw new HttpError(
        "Data ditolak. Periksa identitas perangkat dan message_id.",
        409,
      );
    return NextResponse.json(
      { ok: true, reading_id: data, server_time: new Date().toISOString() },
      { status: 201 },
    );
  } catch (e) {
    return httpError(e);
  }
}
