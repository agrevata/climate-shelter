import { NextResponse } from "next/server";
import { commandSchema } from "../../../../shared/contracts";
import { requireDevice } from "@/lib/auth";
import { demoCommand } from "@/lib/demo-store";
import { readMutation, mutationError } from "@/lib/api-security";
import { HttpError } from "@/lib/request";
import { isWokwiDevice } from "@/lib/wokwi-local";
export async function POST(request: Request) {
  try {
    const p = commandSchema.safeParse(await readMutation(request));
    if (!p.success) throw new HttpError(p.error.issues[0].message, 400);
    const c = p.data,
      auth = await requireDevice(c.deviceId);
    if (auth.demo) {
      if (isWokwiDevice(c.deviceId)) throw new HttpError("Perangkat Wokwi menjalankan AUTO. Gunakan panel setpoint Wokwi; kontrol manual demo tidak dikirim ke ESP32.", 409);
      try {
        return NextResponse.json({
          id: demoCommand(auth.demo.data, c),
          status: "acknowledged",
        });
      } catch (e) {
        throw new HttpError(
          e instanceof Error ? e.message : "Perintah ditolak.",
          409,
        );
      }
    }
    const { data, error } = await auth.db!.rpc("request_actuator", {
      p_device: c.deviceId,
      p_mode: c.mode,
      p_value: c.value,
      p_duration: c.durationSeconds,
      p_reason: c.reason,
    });
    if (error)
      throw new HttpError(
        ["P0001", "42501"].includes(error.code)
          ? error.message
          : "Perintah ditolak.",
        error.code === "42501" ? 403 : 409,
      );
    return NextResponse.json({ id: data, status: "pending" }, { status: 202 });
  } catch (e) {
    return mutationError(e);
  }
}
