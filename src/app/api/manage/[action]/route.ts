import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import {
  deviceFormSchema,
  thresholdsSchema,
  schoolFormSchema,
  memberSchema,
  setpointSchema,
  canAdmin,
} from "../../../../../shared/platform";
import { requireAccount, requireSchool, requireDevice, requireSuperAdmin } from "@/lib/auth";
import { readMutation, mutationError } from "@/lib/api-security";
import { HttpError, localRateLimit } from "@/lib/request";
import { demoAudit, selectDemoSchool } from "@/lib/demo-store";
import { adminClient } from "@/lib/supabase/admin";
import { isWokwiDevice } from "@/lib/wokwi-local";
import { appOrigin } from "@/lib/app-origin";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params,
      raw = await readMutation(request),
      account = await requireAccount();
    localRateLimit("manage:" + account.user.id, 30);
    const schemas = {
      device: deviceFormSchema,
      settings: thresholdsSchema,
      school: schoolFormSchema,
      member: memberSchema,
      setpoint: setpointSchema,
      key: z.object({ deviceId: z.uuid() }).strict(),
      select: z.object({ schoolId: z.uuid() }).strict(),
    };
    const schema = schemas[action as keyof typeof schemas];
    if (!schema) throw new HttpError("Aksi tidak ditemukan.", 404);
    const parsed = schema.safeParse(raw);
    if (!parsed.success)
      throw new HttpError(parsed.error.issues[0].message, 400);
    if (action === "select") {
      await requireSuperAdmin();
      const p = z.object({ schoolId: z.uuid() }).parse(raw);
      await requireSchool(p.schoolId);
      if (account.demo) {
        selectDemoSchool(account.demo, p.schoolId);
      }
      (await cookies()).set("climate_school", p.schoolId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "school") {
      const p = schoolFormSchema.parse(raw);
      if (account.demo?.role !== "super_admin" && !account.db)
        throw new HttpError("Super admin diperlukan.", 403);
      if (account.db) {
        const { data } = await account.db.rpc("is_super_admin");
        if (!data) throw new HttpError("Super admin diperlukan.", 403);
      }
      if (account.demo) {
        const d = account.demo.data,
          s = {
            id: p.id ?? randomUUID(),
            name: p.name,
            slug: p.slug,
            location: p.location,
            latitude: p.latitude,
            longitude: p.longitude,
            is_public: p.isPublic,
            timezone: "Asia/Jakarta",
          };
        d.schools = [...d.schools.filter((v) => v.id !== s.id), s];
        if (d.school.id === s.id) d.school = s;
        demoAudit(d, "school.saved", p.name);
        return NextResponse.json({ id: s.id });
      }
      const r = await account.db!.rpc("admin_school", { p });
      if (r.error)
        throw new HttpError("Sekolah gagal disimpan. Periksa kode unik.", 409);
      return NextResponse.json({ id: r.data });
    }
    if (action === "key") {
      const p = z.object({ deviceId: z.uuid() }).parse(raw);
      const a = await requireDevice(p.deviceId, ["admin"]);
      if (a.demo)
        throw new HttpError(
          "Key perangkat hanya tersedia setelah Supabase dikonfigurasi. Demo tidak menerima data perangkat.",
          409,
        );
      const {data:actuator,error:actuatorError}=await a.db!.from("wokwi_actuators").select("device_id").eq("device_id",p.deviceId).maybeSingle();
      if(actuatorError) throw new HttpError("Pemetaan Wokwi belum tersedia.",503);
      if(actuator) throw new HttpError("Buat key pada ESP32 lokasi ini; aktuator memakai koneksi ESP32.",409);
      const {data:controller,error:controllerError}=await a.db!.from("wokwi_controllers").select("location_id").eq("device_id",p.deviceId).maybeSingle();
      if(controllerError) throw new HttpError("Pemetaan controller belum tersedia.",503);
      const secret = randomBytes(32).toString("hex");
      const { data, error } = await a.db!.rpc("issue_device_key", {
        p_device: p.deviceId,
        p_hash: createHash("sha256").update(secret).digest("hex"),
      });
      if (error) throw new HttpError("Key gagal dibuat.", 409);
      const token="cs_" + data + "_" + secret;
      const origin=appOrigin();
      return NextResponse.json(
        { token,connect:controller && origin.startsWith("https://") ? `CONNECT ${origin}/api/wokwi/telemetry ${token}` : null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (action === "setpoint") {
      const p = setpointSchema.parse(raw);
      const a = await requireDevice(p.deviceId);
      if (a.demo && isWokwiDevice(p.deviceId)) throw new HttpError("Gunakan panel setpoint Wokwi untuk mengirim ke ESP32.", 409);
      if (a.demo) {
        const d = a.demo.data,
          dev = d.devices.find((v) => v.id === p.deviceId)!;
        if (!canAdmin(d.role) && !d.thresholds.allow_operator_setpoints)
          throw new HttpError("Setpoint operator dinonaktifkan.", 403);
        if (
          !["fan", "hvac", "ventilation"].includes(dev.kind) ||
          dev.active === false ||
          !dev.last_seen ||
          Date.now() - Date.parse(dev.last_seen) > 120000 ||
          dev.emergency_latched
        )
          throw new HttpError("Perangkat belum siap.", 409);
        if (
          d.commands.filter(
            (c) => Date.now() - Date.parse(c.created_at) < 60000,
          ).length >= 10
        )
          throw new HttpError("Batas 10 perintah per menit.", 429);
        const control = d.controls.find((c) => c.device_id === dev.id);
        if (control) {
          control.temperature_setpoint = p.temperature;
          control.humidity_setpoint = p.humidity;
          control.updated_at = new Date().toISOString();
          control.updated_by = d.user.id;
        }
        d.commands.unshift({
          id: randomUUID(),
          school_id: d.school.id,
          device_id: dev.id,
          mode: dev.mode,
          value: dev.value,
          duration_seconds: 60,
          reason: p.reason,
          status: "acknowledged",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30000).toISOString(),
          command_type: "setpoint",
          temperature_setpoint: p.temperature,
          humidity_setpoint: p.humidity,
        });
        demoAudit(d, "setpoint.simulated", p.reason, dev.id);
        return NextResponse.json({ ok: true });
      }
      const r = await a.db!.rpc("request_setpoints", {
        p_device: p.deviceId,
        p_temperature: p.temperature,
        p_humidity: p.humidity,
        p_reason: p.reason,
      });
      if (r.error)
        throw new HttpError(
          r.error.code === "P0001" ? r.error.message : "Setpoint ditolak.",
          409,
        );
      return NextResponse.json(
        { id: r.data, status: "pending" },
        { status: 202 },
      );
    }
    if (action === "member") await requireSuperAdmin();
    const schoolId = (parsed.data as { schoolId: string }).schoolId,
      a = await requireSchool(schoolId, ["admin"]);
    if (action === "device") {
      const p = deviceFormSchema.parse(raw);
      if (a.demo) {
        const d = a.demo.data;
        if (!d.zones.some((z) => z.id === p.zoneId))
          throw new HttpError("Zona tidak tersedia.", 400);
        const old = d.devices.find((v) => v.id === p.id);
        if (p.id && !old)
          throw new HttpError("Perangkat tidak ditemukan.", 404);
        if (d.devices.some((v) => v.slug === p.slug && v.id !== p.id))
          throw new HttpError("Kode perangkat sudah digunakan.", 409);
        const dev = {
          id: p.id ?? randomUUID(),
          school_id: schoolId,
          zone_id: p.zoneId,
          name: p.name,
          slug: p.slug,
          kind: p.kind,
          location: p.location,
          firmware_version: p.firmwareVersion,
          active: p.active,
          mode: old?.mode ?? ("AUTO" as const),
          value: old?.value ?? 0,
          last_seen: old?.last_seen ?? null,
          emergency_latched: old?.emergency_latched ?? false,
        };
        d.devices = [...d.devices.filter((v) => v.id !== dev.id), dev];
        if (
          [
            "fan",
            "hvac",
            "ventilation",
            "pump",
            "irrigation",
            "shade",
          ].includes(dev.kind) &&
          !d.controls.some((c) => c.device_id === dev.id)
        )
          d.controls.push({
            device_id: dev.id,
            school_id: schoolId,
            temperature_setpoint: 28,
            humidity_setpoint: 65,
            updated_at: new Date().toISOString(),
            updated_by: d.user.id,
          });
        demoAudit(d, "device.saved", p.name, dev.id);
        return NextResponse.json({ id: dev.id });
      }
      const r = await a.db!.rpc("admin_device", { p });
      if (r.error)
        throw new HttpError(
          "Perangkat gagal disimpan. Periksa kode dan zona.",
          409,
        );
      return NextResponse.json({ id: r.data });
    }
    if (action === "settings") {
      const p = thresholdsSchema.parse(raw);
      if (a.demo) {
        a.demo.data.thresholds = {
          school_id: schoolId,
          temperature_warning: p.temperatureWarning,
          co2_warning: p.co2Warning,
          co2_critical: p.co2Critical,
          pm25_warning: p.pm25Warning,
          pm25_critical: p.pm25Critical,
          pcm_melt_start: p.pcmMeltStart,
          pcm_melt_end: p.pcmMeltEnd,
          allow_operator_setpoints: p.allowOperatorSetpoints,
        };
        demoAudit(
          a.demo.data,
          "settings.updated",
          "Threshold dan izin setpoint diperbarui",
        );
      } else {
        const r = await a.db!.rpc("admin_settings", { p });
        if (r.error) throw new HttpError("Pengaturan ditolak.", 409);
      }
      return NextResponse.json({ ok: true });
    }
    const p = memberSchema.parse(raw);
    if (a.demo) {
      if (p.email.toLowerCase() === a.user.email.toLowerCase())
        throw new HttpError("Tidak dapat mengubah akses sendiri.", 403);
      const otherMembership = [...a.demo.schoolCache.values()].some(s =>
        s.school.id !== schoolId && s.members.some(m => m.email.toLowerCase() === p.email.toLowerCase()));
      if (p.action !== "revoke" && otherMembership)
        throw new HttpError("Akun sudah ditetapkan ke sekolah lain. Cabut akses sekolah lama terlebih dahulu.", 409);
      if (p.role === "admin" && a.demo.role !== "super_admin")
        throw new HttpError("Super admin diperlukan.", 403);
      const d = a.demo.data,
        old = d.members.find((m) => m.email.toLowerCase() === p.email.toLowerCase());
      if (
        (old?.role === "admin" || old?.role === "super_admin") &&
        d.role !== "super_admin"
      )
        throw new HttpError("Super admin diperlukan.", 403);
      d.members = d.members.filter((m) => m.email.toLowerCase() !== p.email.toLowerCase());
      if (p.action !== "revoke")
        d.members.push({
          id: old?.id ?? randomUUID(),
          full_name: "Pengguna demo",
          email: p.email,
          role: p.role,
          school_id: schoolId,
          created_at: new Date().toISOString(),
        });
      demoAudit(d, "membership." + p.action, p.email);
      return NextResponse.json({
        ok: true,
        message: "Keanggotaan demo diperbarui; tidak ada email dikirim.",
      });
    }
    if (p.action === "invite") {
      const { data: isSuper } = await a.db!.rpc("is_super_admin");
      if (p.role === "admin" && !isSuper)
        throw new HttpError("Super admin diperlukan.", 403);
      const { error } = await adminClient().auth.admin.inviteUserByEmail(
        p.email,
        { redirectTo: appOrigin() + "/auth/confirm" },
      );
      if (error)
        throw new HttpError(
          "Undangan gagal. Jika akun sudah terdaftar, gunakan Beri akses.",
          409,
        );
    }
    const r = await a.db!.rpc("admin_member", {
      p_school: schoolId,
      p_email: p.email,
      p_role: p.role,
      p_action: p.action === "invite" ? "grant" : p.action,
    });
    if (r.error)
      throw new HttpError(
        r.error.code === "P0001" || r.error.code === "42501"
          ? r.error.message
          : "Keanggotaan ditolak.",
        403,
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mutationError(e);
  }
}
