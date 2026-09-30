import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createDemo } from "./demo";
import type { DashboardData, Role } from "./types";
import type { CommandInput } from "../../shared/contracts";
import { canAdmin, canOperate } from "../../shared/platform";
export const DEMO_COOKIE = "climate_demo_session";
type Session = {
  data: DashboardData;
  expires: number;
  role: Role;
  schoolCache: Map<string, DashboardData>;
};
const globalStore = globalThis as unknown as {
  climateDemoSessions?: Map<string, Session>;
};
const sessions: Map<string, Session> = (globalStore.climateDemoSessions ??=
  new Map<string, Session>());
export function createDemoSession(role: Role) {
  for (const [id, s] of sessions)
    if (s.expires < Date.now()) sessions.delete(id);
  if (sessions.size >= 1000)
    throw new Error("Demo sedang penuh. Coba kembali nanti.");
  const id = randomBytes(32).toString("hex");
  const data = createDemo();
  data.role = role;
  data.user = {
    id: randomUUID(),
    name: `${role === "public" || role === "viewer" ? "User" : role.replace("_", " ")} Demo`,
    email: "demo@climate.local",
  };
  sessions.set(id, {
    data,
    role,
    expires: Date.now() + 8 * 3600000,
    schoolCache: new Map(),
  });
  return id;
}
export async function demoSession() {
  const id = (await cookies()).get(DEMO_COOKIE)?.value;
  const session = id ? sessions.get(id) : undefined;
  if (!session || session.expires < Date.now()) return null;
  return session;
}
export async function clearDemoSession() {
  const jar = await cookies();
  const id = jar.get(DEMO_COOKIE)?.value;
  if (id) sessions.delete(id);
  jar.delete(DEMO_COOKIE);
}
export function updateSimulation(session: Session) {
  const d = session.data;
  const now = Date.now();
  if (now - Date.parse(d.fetchedAt) < 5000) return d;
  const at = new Date(now).toISOString();
  const wave = Math.sin(now / 240000);
  const previous = new Map(d.sensors.map((r) => [r.zone_id, r]));
  const newReadings = d.zones
    .map((z, i) => {
      const old = previous.get(z.id);
      if (!old) return null;
      return {
        ...old,
        id: randomUUID(),
        recorded_at: at,
        temperature: +([34.8, 29.2, 30.4, 32.1][i % 4] + wave * 0.35).toFixed(
          1,
        ),
        humidity: Math.round(68 + Math.sin(now / 290000 + i) * 3),
        co2: Math.round(780 + Math.sin(now / 330000 + i) * 220),
        pm25: +(18 + Math.sin(now / 370000 + i) * 5).toFixed(1),
        thermal_comfort_index: Math.round(82 + wave * 6),
        pcm_temperature: +(27 + Math.sin(now / 440000) * 1.7).toFixed(1),
      };
    })
    .filter((r) => r !== null);
  d.sensors = [...d.sensors, ...newReadings]
    .filter((r) => Date.parse(r.recorded_at) > now - 30 * 86400000)
    .slice(-5000);
  d.devices.forEach((dev) => {
    if (dev.active !== false && dev.slug !== "sensor-backup")
      dev.last_seen = at;
    const c = d.commands.find(
      (c) => c.device_id === dev.id && c.command_type !== "setpoint",
    );
    if (
      c?.mode === "MANUAL" &&
      dev.value &&
      now > Date.parse(c.created_at) + c.duration_seconds * 1000
    ) {
      dev.value = 0;
      demoAudit(
        d,
        "control.timeout",
        "Durasi manual selesai; output aman.",
        dev.id,
      );
    }
  });
  d.energy = d.energy.map((r, i) =>
    i === d.energy.length - 1 ? { ...r, recorded_at: at } : r,
  );
  d.water = d.water.map((r, i) =>
    i === d.water.length - 1 ? { ...r, recorded_at: at } : r,
  );
  d.fetchedAt = at;
  return d;
}
export function demoAudit(
  data: DashboardData,
  action: string,
  description: string,
  deviceId: string | null = null,
) {
  data.activity.unshift({
    id: randomUUID(),
    school_id: data.school.id,
    user_id: data.user.id,
    action,
    description,
    device_id: deviceId,
    created_at: new Date().toISOString(),
  });
  data.activity = data.activity.slice(0, 200);
}
export function demoCommand(data: DashboardData, c: CommandInput) {
  if (!canOperate(data.role)) throw new Error("Akses kontrol ditolak.");
  const device = data.devices.find(
    (d) => d.id === c.deviceId && d.school_id === data.school.id,
  );
  if (
    !device ||
    device.active === false ||
    !device.last_seen ||
    Date.now() - Date.parse(device.last_seen) > 120000
  )
    throw new Error("Perangkat tidak tersedia atau offline.");
  if (
    !["fan", "shade", "irrigation", "pump", "hvac", "ventilation"].includes(
      device.kind,
    )
  )
    throw new Error("Perangkat bukan aktuator.");
  if (
    data.commands.filter((c) => Date.now() - Date.parse(c.created_at) < 60000)
      .length >= 10
  )
    throw new Error("Batas 10 perintah per menit tercapai.");
  if (
    (device.emergency_latched || device.mode === "EMERGENCY") &&
    c.mode !== "EMERGENCY" &&
    !canAdmin(data.role)
  )
    throw new Error("Hanya admin dapat melepas emergency.");
  if (
    ["irrigation", "pump", "hvac", "ventilation"].includes(device.kind) &&
    ![0, 100].includes(c.value)
  )
    throw new Error("Perangkat hanya mendukung ON/OFF.");
  const tank = data.water.at(-1);
  if (
    ["irrigation", "pump"].includes(device.kind) &&
    c.mode === "MANUAL" &&
    c.value > 0 &&
    (!tank ||
      tank.tank_level <= 15 ||
      Date.now() - Date.parse(tank.recorded_at) > 120000)
  )
    throw new Error("Data tandon tidak aman untuk penyiraman.");
  const id = randomUUID(),
    at = new Date().toISOString();
  device.mode = c.mode;
  device.emergency_latched = c.mode === "EMERGENCY";
  device.value =
    c.mode === "AUTO"
      ? device.kind === "fan"
        ? 65
        : device.kind === "shade"
          ? 85
          : 0
      : c.value;
  data.commands.unshift({
    id,
    device_id: device.id,
    school_id: data.school.id,
    mode: c.mode,
    value: c.value,
    duration_seconds: c.durationSeconds,
    reason: c.reason,
    status: "acknowledged",
    created_at: at,
    expires_at: new Date(Date.now() + 30000).toISOString(),
    command_type: "actuator",
  });
  data.logs.unshift({
    id: randomUUID(),
    school_id: data.school.id,
    device_id: device.id,
    command_id: id,
    event: "simulated",
    detail: c.reason,
    created_at: at,
  });
  demoAudit(
    data,
    "command.simulated",
    `${device.name}: ${c.mode} ${c.value}% · ${c.reason}`,
    device.id,
  );
  return id;
}

export function selectDemoSchool(session: Session, id: string) {
  const current = session.data,
    school = current.schools.find((s) => s.id === id);
  if (!school) throw new Error("Sekolah tidak tersedia.");
  session.schoolCache.set(current.school.id, current);
  const cached = session.schoolCache.get(id);
  session.data = cached
    ? {
        ...cached,
        schools: current.schools,
        role: current.role,
        user: current.user,
      }
    : {
        ...current,
        school,
        schools: current.schools,
        zones: [
          {
            id: randomUUID(),
            school_id: id,
            slug: "shelter",
            name: "Climate Shelter",
            kind: "shelter",
            description: "Zona utama sekolah",
          },
        ],
        devices: [],
        sensors: [],
        energy: [],
        water: [],
        commands: [],
        logs: [],
        alerts: [],
        controls: [],
        activity: [],
        members: [],
        thresholds: { ...current.thresholds, school_id: id },
      };
}
