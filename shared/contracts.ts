import { z } from "zod";

export const modeSchema = z.enum(["AUTO", "MANUAL", "EMERGENCY"]);
export type Mode = z.infer<typeof modeSchema>;
export const commandSchema = z
  .object({
    deviceId: z.uuid(),
    mode: modeSchema,
    value: z.number().int().min(0).max(100),
    durationSeconds: z.number().int().min(5).max(300),
    reason: z
      .string()
      .trim()
      .min(5)
      .max(200)
      .regex(
        /^[^\x00-\x1f<>]*$/,
        "Alasan tidak boleh berisi markup atau karakter kontrol",
      ),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode !== "MANUAL" && v.value !== 0)
      ctx.addIssue({
        code: "custom",
        message: "AUTO/EMERGENCY memakai nilai 0",
        path: ["value"],
      });
  });
export type CommandInput = z.infer<typeof commandSchema>;
const timestamp = z.iso.datetime({ offset: true });
const identity = {
  message_id: z.uuid(),
  device_id: z.uuid(),
  recorded_at: timestamp,
};
export const sensorPayload = z
  .object({
    ...identity,
    temperature: z.number().min(-20).max(80),
    humidity: z.number().min(0).max(100),
    wbgt: z.number().min(-20).max(65).nullable().optional(),
    surface_temperature: z.number().min(-30).max(120).nullable().optional(),
    co2: z.number().min(0).max(20000).nullable().optional(),
    pm25: z.number().min(0).max(1000).nullable().optional(),
    thermal_comfort_index: z.number().min(0).max(100).nullable().optional(),
    energy_consumption: z.number().min(0).max(1e9).nullable().optional(),
    pcm_temperature: z.number().min(-20).max(100).nullable().optional(),
    soil_moisture: z.number().min(0).max(100).nullable(),
  })
  .strict();
export const energyPayload = z
  .object({
    ...identity,
    voltage: z.number().min(0).max(500),
    current: z.number().min(0).max(100),
    power_w: z.number().min(0).max(30000),
    energy_kwh: z.number().min(0).max(1e9),
  })
  .strict();
export const waterPayload = z
  .object({
    ...identity,
    tank_level: z.number().min(0).max(100),
    stored_liters: z.number().min(0).max(100000),
    used_liters: z.number().min(0).max(1e9),
    harvested_liters: z.number().min(0).max(1e9),
  })
  .strict();
export const heartbeatPayload = z
  .object({ ...identity, value: z.number().int().min(0).max(100).optional() })
  .strict();
export const ackPayload = z
  .object({
    ...identity,
    command_id: z.uuid(),
    temperature_setpoint: z.number().min(18).max(32).optional(),
    humidity_setpoint: z.number().min(40).max(80).optional(),
    status: z.enum(["acknowledged", "failed"]),
    mode: modeSchema,
    value: z.number().int().min(0).max(100),
    detail: z
      .string()
      .max(200)
      .regex(/^[^\x00-\x1f<>]*$/),
  })
  .strict();
export function parseTopic(topic: string) {
  const match =
    /^climateshelter\/([a-z0-9-]{1,40})\/([a-z0-9-]{1,40})\/(telemetry|energy|water|heartbeat|ack)$/.exec(
      topic,
    );
  return match
    ? {
        school: match[1],
        zone: match[2],
        kind: match[3] as
          "telemetry" | "energy" | "water" | "heartbeat" | "ack",
      }
    : null;
}
export function isFresh(
  timestamp: string,
  now = Date.now(),
  maxAgeMs = 120000,
) {
  const age = now - Date.parse(timestamp);
  return Number.isFinite(age) && age >= -30000 && age <= maxAgeMs;
}
export function riskLevel(wbgt: number | null | undefined) {
  if (wbgt == null || !Number.isFinite(wbgt))
    return { label: "Belum ada data", tone: "neutral" } as const;
  if (wbgt >= 31) return { label: "Sangat tinggi", tone: "danger" } as const;
  if (wbgt >= 28) return { label: "Tinggi", tone: "warning" } as const;
  if (wbgt >= 25) return { label: "Waspada", tone: "amber" } as const;
  return { label: "Rendah", tone: "good" } as const;
}
