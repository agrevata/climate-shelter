import { z } from "zod";

export const WOKWI_SETPOINT = 26.7;
export const WOKWI_HYSTERESIS = 0.5;
export const WOKWI_LOCATIONS = {
  shelter: { id: "shelter", name: "Shelter", deviceId: "climate-shelter-esp32", zoneId: "20000000-0000-4000-8000-000000000002", roomActuators: false, projectUrl: "https://wokwi.com/projects/476516571987622913" },
  classroom: { id: "classroom", name: "Ruang Kelas", deviceId: "climate-classroom-esp32", zoneId: "20000000-0000-4000-8000-000000000004", roomActuators: true, projectUrl: "https://wokwi.com/projects/476418811507177473" },
} as const;
export const wokwiLocationSchema = z.enum(["shelter", "classroom"]);
export type WokwiLocation = z.infer<typeof wokwiLocationSchema>;
export type WokwiLocationInfo = {
  id: WokwiLocation; name: string; deviceId: string; zoneId: string;
  roomActuators: boolean; projectUrl: string;
};
export const wokwiTelemetrySchema = z.object({
  device_id: z.enum(["climate-shelter-esp32", "climate-classroom-esp32"]),
  location_id: wokwiLocationSchema,
  message_id: z.uuid(),
  temperature: z.number().min(-20).max(80).nullable(),
  humidity: z.number().min(0).max(100).nullable(),
  co2: z.number().min(400).max(2000),
  pm25: z.number().min(0).max(150),
  pcm_temperature: z.number().min(18).max(45),
  light_lux: z.number().min(0).max(100000),
  occupancy: z.boolean(),
  sensor_ok: z.boolean(),
  tank_ok: z.boolean(),
  fan_on: z.boolean(),
  pump_on: z.boolean(),
  hvac_on: z.boolean(),
  ventilation_degrees: z.number().int().min(0).max(180),
  setpoint: z.number().min(18).max(32),
  firmware_version: z.literal("climate-wokwi-3.0"),
}).strict().superRefine((p, ctx) => {
  if (p.device_id !== WOKWI_LOCATIONS[p.location_id].deviceId)
    ctx.addIssue({ code: "custom", message: "Device does not belong to this location" });
  if (p.location_id === "shelter" && (p.hvac_on || p.ventilation_degrees !== 0))
    ctx.addIssue({ code: "custom", message: "Shelter has no HVAC or ventilation actuator" });
  if (p.sensor_ok !== (p.temperature !== null && p.humidity !== null))
    ctx.addIssue({ code: "custom", message: "Sensor validity mismatch" });
  if (p.pump_on && (!p.fan_on || !p.tank_ok || !p.sensor_ok))
    ctx.addIssue({ code: "custom", message: "Pump interlock violated" });
  if (!p.sensor_ok && (p.fan_on || p.pump_on || p.hvac_on || p.ventilation_degrees !== 0))
    ctx.addIssue({ code: "custom", message: "Invalid sensor must stop outputs" });
});
export type WokwiTelemetry = z.infer<typeof wokwiTelemetrySchema>;
export type WokwiSample = WokwiTelemetry & { received_at: string };
export type WokwiState = {
  controllerId?: string;
  location: WokwiLocationInfo;
  enabled: boolean;
  latest: WokwiSample | null;
  history: WokwiSample[];
  requestedSetpoint: number;
};
export function coolingDemand(temperature: number | null, wasOn: boolean, setpoint = WOKWI_SETPOINT) {
  if (temperature === null || !Number.isFinite(temperature)) return false;
  return wasOn ? temperature > setpoint - WOKWI_HYSTERESIS : temperature > setpoint;
}
