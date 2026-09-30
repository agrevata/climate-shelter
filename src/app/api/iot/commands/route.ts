import type { ActuatorCommand } from "@/lib/types";
import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { httpError, HttpError } from "@/lib/request";
export async function GET(request: Request) {
  try {
    const { db, deviceId } = await authenticateDevice(request);
    const { data, error } = await db.rpc("device_command_queue", {
      p_device: deviceId,
    });
    if (error) throw new HttpError("Antrean tidak tersedia.", 503);
    return NextResponse.json(
      {
        commands: (data ?? []).map(
          (c: ActuatorCommand & { sequence: number }) => ({
            id: c.id,
            sequence: c.sequence,
            command_type: c.command_type,
            mode: c.mode,
            value: c.value,
            duration_seconds: c.duration_seconds,
            expires_at: c.expires_at,
            temperature_setpoint: c.temperature_setpoint,
            humidity_setpoint: c.humidity_setpoint,
          }),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return httpError(e);
  }
}
