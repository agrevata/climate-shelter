import "server-only";
import { cache } from "react";
import { forDashboardRole } from "../../shared/monitoring-access";
import { cookies } from "next/headers";
import { requireAccount } from "./auth";
import { updateSimulation } from "./demo-store";
import { overlayWokwi } from "./wokwi-local";
import { loadCloudWokwi } from "./wokwi-cloud";
import { overlayCloudWokwi } from "../../shared/wokwi-cloud";
import { HttpError } from "./request";
import type { DashboardData, Role, SensorReading } from "./types";
export class DataError extends HttpError {}
export const loadDashboard = cache(async (): Promise<DashboardData> => {
  const auth = await requireAccount();
  if (auth.demo) {
    const d = overlayWokwi(updateSimulation(auth.demo));
    return forDashboardRole({
      ...d,
      statistics:
        d.role === "super_admin"
          ? d.schools.map((s) => {
              const v =
                s.id === d.school.id ? d : auth.demo!.schoolCache.get(s.id);
              return {
                school_id: s.id,
                devices:
                  v?.devices.filter((d) => d.active !== false).length ?? 0,
                online:
                  v?.devices.filter(
                    (d) =>
                      d.active !== false &&
                      d.last_seen &&
                      Date.now() - Date.parse(d.last_seen) < 120000,
                  ).length ?? 0,
                alerts: v?.alerts.filter((a) => !a.resolved_at).length ?? 0,
                members: v?.members.length ?? 0,
              };
            })
          : [],
      schools: d.role === "super_admin" ? d.schools : [d.school],
      members: ["admin", "super_admin"].includes(d.role) ? d.members : [],
    });
  }
  const db = auth.db!;
  const [{ data: profile }, { data: schools, error: schoolError }] =
    await Promise.all([
      db
        .from("profiles")
        .select("role,full_name")
        .eq("id", auth.user.id)
        .single(),
      db.from("schools").select("*").order("name"),
    ]);
  if (schoolError) throw new DataError("Sekolah tidak dapat dimuat.", 503);
  if (!schools?.length)
    throw new DataError("Akun belum diberi akses sekolah. Hubungi admin.", 403);
  const isSuper = profile?.role === "super_admin";
  if (!isSuper && schools.length !== 1)
    throw new DataError("Akun harus ditetapkan ke satu sekolah. Hubungi super admin.", 403);
  // Only a super admin's management workspace may follow this cookie.
  const selected = isSuper ? (await cookies()).get("climate_school")?.value : undefined;
  const school = schools.find((s) => s.id === selected) ?? schools[0],
    id = school.id;
  const { data: member, error: memberError } = await db
    .from("school_members")
    .select("role")
    .eq("school_id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!isSuper && (memberError || !member))
    throw new DataError("Akses sekolah belum ditetapkan. Hubungi super admin.", 403);
  const role: Role =
    profile?.role === "super_admin"
      ? "super_admin"
      : (member?.role ?? "public");
  const results = await Promise.all([
    db.from("zones").select("*").eq("school_id", id).order("name"),
    db.from("devices").select("*").eq("school_id", id).order("name"),
    db.rpc("sensor_history", { p_school: id, p_hours: 720 }),
    db.rpc("sensor_history", { p_school: id, p_hours: 6 }),
    db.rpc("dashboard_resource_history", { p_school: id, p_kind: "energy" }),
    db.rpc("dashboard_resource_history", { p_school: id, p_kind: "water" }),
    db
      .from("actuator_commands")
      .select("*")
      .eq("school_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("actuator_logs")
      .select("*")
      .eq("school_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("alerts")
      .select("*")
      .eq("school_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("device_controls").select("*").eq("school_id", id),
    db
      .from("activity_logs")
      .select("*")
      .eq("school_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("school_settings").select("*").eq("school_id", id).single(),
  ]);
  if (results.some((r) => r.error))
    throw new DataError(
      "Data belum dapat dimuat. Periksa koneksi dan migration database.",
      503,
    );
  const [
    zones,
    devices,
    history,
    live,
    energy,
    water,
    commands,
    logs,
    alerts,
    controls,
    activity,
    thresholds,
  ] = results.map((r) => r.data);
  const sensors = [
    ...new Map(
      [...(history ?? []), ...(live ?? [])].map((r: SensorReading) => [
        r.id,
        r,
      ]),
    ).values(),
  ].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const members = ["admin", "super_admin"].includes(role)
    ? await db.rpc("admin_members", { p_school: id })
    : { data: [] };
  const wokwi = ["admin", "operator", "super_admin"].includes(role) ? await loadCloudWokwi(db,id) : [];
  return forDashboardRole(overlayCloudWokwi({
    school,
    schools: isSuper ? schools : [school],
    statistics:
      role === "super_admin"
        ? ((await db.rpc("system_statistics")).data ?? [])
        : [],
    zones,
    devices,
    sensors,
    energy: energy ?? [],
    water: water ?? [],
    commands,
    logs,
    alerts,
    controls,
    activity,
    thresholds,
    members: members.data ?? [],
    role,
    user: { ...auth.user, name: profile?.full_name || auth.user.name },
    source: "supabase",
    fetchedAt: new Date().toISOString(),
  } as DashboardData, wokwi));
});
