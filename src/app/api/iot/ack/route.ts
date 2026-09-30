import { NextResponse } from "next/server";
import { ackPayload } from "../../../../../shared/contracts";
import { authenticateDevice } from "@/lib/device-auth";
import { readJson, httpError, HttpError } from "@/lib/request";
export async function POST(request: Request) {
  try {
    const p = ackPayload.safeParse(await readJson(request));
    if (!p.success) throw new HttpError("ACK tidak valid.", 400);
    const { db, deviceId } = await authenticateDevice(request);
    if (deviceId !== p.data.device_id)
      throw new HttpError("Identitas perangkat tidak sesuai.", 403);
    const { data: device } = await db
      .from("devices")
      .select("school_id")
      .eq("id", deviceId)
      .single();
    if (!device) throw new HttpError("Perangkat tidak ditemukan.", 403);
    const { error } = await db.rpc("confirm_command", {
      p_school: device.school_id,
      p_device: deviceId,
      p_command: p.data.command_id,
      p_status: p.data.status,
      p_mode: p.data.mode,
      p_value: p.data.value,
      p_detail: p.data.detail,
      p_temperature: p.data.temperature_setpoint ?? null,
      p_humidity: p.data.humidity_setpoint ?? null,
    });
    if (error)
      throw new HttpError("ACK ditolak atau perintah kedaluwarsa.", 409);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return httpError(e);
  }
}
