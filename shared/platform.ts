import { z } from "zod";
const label = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[^<>\x00-\x1f]+$/);
export const roleSchema = z.enum([
  "public",
  "operator",
  "admin",
  "super_admin",
  "viewer",
]);
export const deviceKindSchema = z.enum([
  "sensor",
  "fan",
  "shade",
  "irrigation",
  "energy",
  "water",
  "hvac",
  "pump",
  "ventilation",
]);
export const deviceFormSchema = z
  .object({
    id: z.uuid().optional(),
    schoolId: z.uuid(),
    zoneId: z.uuid(),
    name: label,
    slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
    kind: deviceKindSchema,
    location: label,
    firmwareVersion: z
      .string()
      .max(40)
      .regex(/^[a-zA-Z0-9 ._-]*$/),
    active: z.boolean(),
  })
  .strict();
export const setpointSchema = z
  .object({
    deviceId: z.uuid(),
    temperature: z.number().min(18).max(32),
    humidity: z.number().min(40).max(80),
    reason: label.min(5),
  })
  .strict();
export const thresholdsSchema = z
  .object({
    schoolId: z.uuid(),
    temperatureWarning: z.number().min(20).max(45),
    co2Warning: z.number().int().min(400).max(2000),
    co2Critical: z.number().int().min(401).max(5000),
    pm25Warning: z.number().min(1).max(150),
    pm25Critical: z.number().min(2).max(300),
    pcmMeltStart: z.number().min(10).max(60),
    pcmMeltEnd: z.number().min(11).max(65),
    allowOperatorSetpoints: z.boolean(),
  })
  .strict()
  .refine(
    (v) =>
      v.co2Critical > v.co2Warning &&
      v.pm25Critical > v.pm25Warning &&
      v.pcmMeltEnd > v.pcmMeltStart,
    "Batas critical/end harus lebih tinggi daripada warning/start.",
  );
export const schoolFormSchema = z
  .object({
    id: z.uuid().optional(),
    name: label,
    slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
    location: label,
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    isPublic: z.boolean(),
  })
  .strict();
export const memberSchema = z
  .object({
    schoolId: z.uuid(),
    email: z.email().max(254),
    role: z.enum(["operator", "admin", "public"]),
    action: z.enum(["grant", "revoke", "invite"]),
  })
  .strict();
export const iotSensorSchema = z
  .object({
    device_id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9-]+$/),
    message_id: z.uuid(),
    temperature: z.number().min(-20).max(80),
    humidity: z.number().min(0).max(100),
    co2: z.number().min(0).max(20000).nullable().optional(),
    pm25: z.number().min(0).max(1000).nullable().optional(),
    thermal_comfort_index: z.number().min(0).max(100).nullable().optional(),
    energy: z.number().min(0).max(1e9).nullable().optional(),
    pcm_temperature: z.number().min(-20).max(100).nullable().optional(),
    wbgt: z.number().min(-20).max(65).nullable().optional(),
    surface_temperature: z.number().min(-30).max(120).nullable().optional(),
    soil_moisture: z.number().min(0).max(100).nullable().optional(),
    recorded_at: z.iso.datetime({ offset: true }).optional(),
    firmware_version: z
      .string()
      .max(40)
      .regex(/^[a-zA-Z0-9 ._-]*$/)
      .optional(),
  })
  .strict();
export type PlatformRole = z.infer<typeof roleSchema>;
export function canOperate(role: string) {
  return ["operator", "admin", "super_admin"].includes(role);
}
export function canAdmin(role: string) {
  return ["admin", "super_admin"].includes(role);
}
export function canView(role: string) {
  return ["viewer", "public", "operator", "admin", "super_admin"].includes(role);
}
