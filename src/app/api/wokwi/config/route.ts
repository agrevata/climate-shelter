import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { readMutation, mutationError } from "@/lib/api-security";
import { HttpError } from "@/lib/request";
import { setWokwiSetpoint, wokwiEnabled } from "@/lib/wokwi-local";
import { canAdmin, canOperate } from "../../../../../shared/platform";
import { SCHOOL_ID } from "@/lib/demo";
import { wokwiLocationSchema } from "../../../../../shared/wokwi";
export async function POST(request: Request) {
  try {
    const raw = await readMutation(request), a = await requireAccount();
    const p = z.object({ location_id: wokwiLocationSchema, controller_id:z.uuid().optional(), setpoint: z.number().min(18).max(32) }).strict().safeParse(raw);
    if (!p.success) throw new HttpError("Setpoint harus 18–32°C.", 400);
    if(!a.demo) {
      if(!p.data.controller_id) throw new HttpError("Controller belum dipilih.",400);
      const {data:controller,error:readError}=await a.db!.from("wokwi_controllers")
        .select("device_id,location_id").eq("device_id",p.data.controller_id).maybeSingle();
      if(readError || !controller || controller.location_id!==p.data.location_id) throw new HttpError("Controller tidak dapat diakses.",403);
      const {data,error}=await a.db!.rpc("set_wokwi_setpoint",{p_controller:controller.device_id,p_setpoint:p.data.setpoint});
      if(error) throw new HttpError(["P0001","42501"].includes(error.code) ? error.message : "Setpoint ditolak.",error.code==="42501" ? 403 : 409);
      return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
    }
    if (!wokwiEnabled() || !a.demo || a.demo.data.school.id !== SCHOOL_ID) throw new HttpError("Simulator lokal tidak aktif untuk sekolah ini.", 409);
    if (!canOperate(a.demo.role) || (!canAdmin(a.demo.role) && !a.demo.data.thresholds.allow_operator_setpoints)) throw new HttpError("Akses setpoint ditolak.", 403);
    setWokwiSetpoint(p.data.location_id, p.data.setpoint);
    return NextResponse.json({ ok: true, status: "pending", setpoint: p.data.setpoint });
  } catch (e) { return mutationError(e); }
}
