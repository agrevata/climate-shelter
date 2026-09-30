import "server-only";
import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { isDemo } from "./env";
import { HttpError } from "./request";
import { WOKWI_SETPOINT, WOKWI_LOCATIONS, wokwiTelemetrySchema, type WokwiLocation, type WokwiState, type WokwiSample, type WokwiTelemetry } from "../../shared/wokwi";
import type { DashboardData } from "./types";
import { SCHOOL_ID, deviceId } from "./demo";

const folder = path.join(process.cwd(), "work", "wokwi");
export const wokwiEnabled = () => isDemo && process.env.WOKWI_LOCAL_ENABLED === "true";
function read(name: string): unknown {
  try { return JSON.parse(readFileSync(path.join(folder, name), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
function write(name: string, value: unknown) {
  mkdirSync(folder, { recursive: true });
  const temp = path.join(folder, `${name}.${randomUUID()}.tmp`);
  writeFileSync(temp, JSON.stringify(value));
  renameSync(temp, path.join(folder, name));
}
export function authorizeWokwi(request: Request) {
  if (!wokwiEnabled()) throw new HttpError("Jalur simulasi Wokwi tidak aktif.", 404);
  const expected = process.env.WOKWI_INGEST_TOKEN ?? "";
  const actual = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (expected.length < 32 || actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual)))
    throw new HttpError("Token simulator tidak valid.", 401);
}
export function readWokwi(locationId: WokwiLocation = "shelter"): WokwiState {
  const location = WOKWI_LOCATIONS[locationId];
  if (!wokwiEnabled()) return { location, enabled: false, latest: null, history: [], requestedSetpoint: WOKWI_SETPOINT };
  const raw = read(`history-${locationId}.json`);
  const history = Array.isArray(raw) ? raw.filter((r): r is WokwiSample =>
    r?.location_id === locationId &&
    typeof r?.received_at === "string" && Number.isFinite(Date.parse(r.received_at)) &&
    wokwiTelemetrySchema.safeParse(Object.fromEntries(Object.entries(r).filter(([k]) => k !== "received_at"))).success) : [];
  const config = read(`config-${locationId}.json`) as { setpoint?: number } | null;
  const sp = config?.setpoint;
  return { location, enabled: true, latest: history.at(-1) ?? null, history,
    requestedSetpoint: typeof sp === "number" && sp >= 18 && sp <= 32 ? sp : WOKWI_SETPOINT };
}
export function saveWokwi(p: WokwiTelemetry) {
  const state = readWokwi(p.location_id);
  const prior = state.history.find(s => s.message_id === p.message_id);
  if (prior) return prior;
  const sample = { ...p, received_at: new Date().toISOString() };
  write(`history-${p.location_id}.json`, [...state.history, sample].slice(-720));
  return sample;
}
export function setWokwiSetpoint(locationId: WokwiLocation, setpoint: number) {
  write(`config-${locationId}.json`, { setpoint, updated_at: new Date().toISOString() });
}
export function isWokwiDevice(id: string) {
  return wokwiEnabled() && [2, 4, 5, 11, 12, 13, 14, 15].some(n => deviceId(n) === id);
}
export function overlayWokwi(data: DashboardData): DashboardData {
  if (!wokwiEnabled() || data.school.id !== SCHOOL_ID) return data;
  const locations = [readWokwi("shelter"), readWokwi("classroom")];
  const managedDevices = locations.flatMap(state => {
    const s = state.latest, room = state.location.roomActuators;
    const defs: [number, string, import("./types").Device["kind"], number][] = [
      [room ? 4 : 2, "ESP32", "sensor", 0],
      [room ? 14 : 5, "Kipas", "fan", s?.fan_on ? 100 : 0],
      [room ? 15 : 12, "Pompa air", "pump", s?.pump_on ? 100 : 0],
      ...(room ? [[11, "HVAC", "hvac", s?.hvac_on ? 100 : 0], [13, "Ventilasi", "ventilation", (s?.ventilation_degrees ?? 0) > 0 ? 100 : 0]] as [number, string, import("./types").Device["kind"], number][] : []),
    ];
    return defs.map(([n, name, kind, value]): import("./types").Device => ({
      id: deviceId(n), school_id: SCHOOL_ID, zone_id: state.location.zoneId,
      slug: `${state.location.id}-${kind}`, name: `${name} ${state.location.name}`, kind, value,
      mode: "AUTO", emergency_latched: false, active: true, location: state.location.name,
      firmware_version: "climate-wokwi-3.0", last_seen: s?.received_at ?? null,
    }));
  });
  return { ...data, wokwi: locations[0], wokwiLocations: locations,
    zones: data.zones.map(z => {
      const state = locations.find(s => s.location.zoneId === z.id);
      return state ? { ...z, name: state.location.name } : z;
    }),
    devices: [...data.devices.filter(d => !isWokwiDevice(d.id) && !locations.some(s => s.location.zoneId === d.zone_id)), ...managedDevices],
    sensors: [...data.sensors.filter(r => !locations.some(s => s.location.zoneId === r.zone_id)), ...locations.flatMap(state => state.history.filter(r => r.sensor_ok).map(r => ({
      id: r.message_id, device_id: deviceId(state.location.roomActuators ? 4 : 2), school_id: SCHOOL_ID, zone_id: state.location.zoneId, recorded_at: r.received_at,
      temperature: r.temperature!, humidity: r.humidity!, co2: r.co2, pm25: r.pm25, pcm_temperature: r.pcm_temperature,
      wbgt: null, surface_temperature: null, soil_moisture: null,
    })))].sort((a,b) => a.recorded_at.localeCompare(b.recorded_at)),
    controls: data.controls.map(c => {
      const device = managedDevices.find(d => d.id === c.device_id);
      const state = locations.find(s => s.location.zoneId === device?.zone_id);
      return state ? { ...c, temperature_setpoint: state.latest?.setpoint ?? WOKWI_SETPOINT } : c;
    }),
  };
}
