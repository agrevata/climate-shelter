import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccount, requireSchool } from "@/lib/auth";
import { demoAudit } from "@/lib/demo-store";
import { readMutation, mutationError } from "@/lib/api-security";
import { HttpError } from "@/lib/request";
export async function POST(request: Request) {
  try {
    const p = z
      .object({
        id: z.uuid(),
        action: z.enum(["acknowledge", "resolve"]).default("acknowledge"),
      })
      .strict()
      .safeParse(await readMutation(request));
    if (!p.success) throw new HttpError("Permintaan alert tidak valid.", 400);
    const a = await requireAccount();
    if (a.demo) {
      await requireSchool(a.demo.data.school.id, ["admin", "operator"]);
      const alert = a.demo.data.alerts.find((v) => v.id === p.data.id);
      if (!alert) throw new HttpError("Alert tidak tersedia.", 404);
      if (p.data.action === "resolve")
        alert.resolved_at = new Date().toISOString();
      alert.acknowledged_at = new Date().toISOString();
      demoAudit(a.demo.data, "alert." + p.data.action, alert.title);
    } else {
      const { error } = await a.db!.rpc(
        p.data.action === "resolve" ? "resolve_alert" : "acknowledge_alert",
        { p_alert: p.data.id },
      );
      if (error)
        throw new HttpError("Akses ditolak atau alert tidak tersedia.", 403);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mutationError(e);
  }
}
