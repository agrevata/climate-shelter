import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import mqtt from "mqtt";
import { z } from "zod";
import {
  ackPayload,
  energyPayload,
  heartbeatPayload,
  isFresh,
  parseTopic,
  sensorPayload,
  waterPayload,
} from "../../../shared/contracts.js";

const configSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  MQTT_URL: z.url(),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_CLIENT_ID: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,60}$/)
    .default("climate-bridge-school01"),
  SCHOOL_SLUG: z.string().regex(/^[a-z0-9-]{1,40}$/),
  ALLOW_INSECURE_LOCAL_MQTT: z.enum(["true", "false"]).default("false"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
});
const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "Invalid bridge environment. Check required names in .env.example.",
  );
  process.exit(1);
}
const env = parsed.data;
const broker = new URL(env.MQTT_URL);
const localBroker = ["127.0.0.1", "localhost", "[::1]"].includes(
  broker.hostname,
);
if (broker.username || broker.password) {
  console.error(
    "Use MQTT_USERNAME and MQTT_PASSWORD instead of credentials in the URL.",
  );
  process.exit(1);
}
if (
  broker.protocol !== "mqtts:" &&
  !(
    broker.protocol === "mqtt:" &&
    localBroker &&
    env.ALLOW_INSECURE_LOCAL_MQTT === "true"
  )
) {
  console.error(
    "MQTT must use mqtts://. Plain MQTT is permitted only for an explicitly enabled loopback broker.",
  );
  process.exit(1);
}
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
  },
});
const { data: school, error: schoolError } = await db
  .from("schools")
  .select("id")
  .eq("slug", env.SCHOOL_SLUG)
  .single();
if (schoolError || !school) {
  console.error(
    "School unavailable. Check Supabase credentials, migration and school slug.",
  );
  process.exit(1);
}
type Device = {
  id: string;
  school_id: string;
  zone_id: string;
  slug: string;
  kind: string;
  last_seen: string | null;
  mode: string;
  value: number;
  emergency_latched: boolean;
};
let devices = new Map<string, Device>();
let zones = new Map<string, string>();
let lastSync = 0;
let lastDbOk = 0;
async function syncDevices() {
  const [ds, zs] = await Promise.all([
    db
      .from("devices")
      .select("*")
      .eq("school_id", school!.id)
      .eq("active", true),
    db.from("zones").select("id,slug").eq("school_id", school!.id),
  ]);
  if (ds.error || zs.error) throw new Error("DEVICE_SYNC_FAILED");
  devices = new Map((ds.data as Device[]).map((d) => [d.id, d]));
  zones = new Map(zs.data!.map((z) => [z.id, z.slug]));
  lastSync = Date.now();
  lastDbOk = Date.now();
}
await syncDevices();
const client = mqtt.connect(env.MQTT_URL, {
  username: env.MQTT_USERNAME || undefined,
  password: env.MQTT_PASSWORD || undefined,
  clientId: env.MQTT_CLIENT_ID,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 10000,
  keepalive: 30,
  rejectUnauthorized: true,
  protocolVersion: 5,
  properties: { maximumPacketSize: 8192, receiveMaximum: 20 },
  queueQoSZero: false,
});
const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(
    JSON.stringify({ time: new Date().toISOString(), event, ...fields }),
  );
client.on("connect", () => {
  client.subscribe(
    `climateshelter/${env.SCHOOL_SLUG}/+/+`,
    { qos: 1 },
    (error) => log(error ? "subscription_failed" : "mqtt_connected"),
  );
});
client.on("error", () => log("mqtt_error"));
client.on("offline", () => log("mqtt_offline"));
let queue = Promise.resolve();
let queued = 0;
let stopping = false;
const rates = new Map<string, { start: number; count: number }>();
const schemas = {
  telemetry: sensorPayload,
  energy: energyPayload,
  water: waterPayload,
  heartbeat: heartbeatPayload,
  ack: ackPayload,
};

async function ingest(topic: string, raw: Buffer, retained: boolean) {
  const route = parseTopic(topic);
  if (
    !route ||
    route.school !== env.SCHOOL_SLUG ||
    retained ||
    raw.byteLength > 4096
  )
    return;
  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    log("payload_rejected", { reason: "json" });
    return;
  }
  const checked = schemas[route.kind].safeParse(json);
  if (!checked.success) {
    log("payload_rejected", { reason: "schema" });
    return;
  }
  const payload = checked.data;
  if (!isFresh(payload.recorded_at)) {
    log("payload_rejected", { reason: "timestamp" });
    return;
  }
  if (Date.now() - lastSync > 60000) await syncDevices();
  const device = devices.get(payload.device_id);
  if (!device || zones.get(device.zone_id) !== route.zone) {
    log("payload_rejected", { reason: "device_topic_mismatch" });
    return;
  }
  const actuator = [
    "fan",
    "shade",
    "irrigation",
    "hvac",
    "pump",
    "ventilation",
  ].includes(device.kind);
  const expected = { telemetry: "sensor", energy: "energy", water: "water" };
  if (
    (route.kind in expected &&
      device.kind !== expected[route.kind as keyof typeof expected]) ||
    (route.kind === "ack" && !actuator)
  ) {
    log("payload_rejected", { reason: "device_kind" });
    return;
  }
  const rate = rates.get(device.id) ?? { start: Date.now(), count: 0 };
  if (Date.now() - rate.start > 60000) {
    rate.start = Date.now();
    rate.count = 0;
  }
  rate.count++;
  rates.set(device.id, rate);
  if (rate.count > 120) {
    log("payload_rejected", { reason: "rate_limit" });
    return;
  }
  const { message_id, device_id, recorded_at } = payload;
  if (route.kind === "ack") {
    const ack = ackPayload.parse(payload);
    const { error } = await db.rpc("confirm_command", {
      p_school: school!.id,
      p_device: device.id,
      p_command: ack.command_id,
      p_status: ack.status,
      p_mode: ack.mode,
      p_value: ack.value,
      p_detail: ack.detail,
      p_temperature: ack.temperature_setpoint ?? null,
      p_humidity: ack.humidity_setpoint ?? null,
    });
    if (error) throw new Error("ACK_REJECTED");
  } else if (route.kind !== "heartbeat") {
    const table =
      route.kind === "telemetry"
        ? "sensor_readings"
        : route.kind === "energy"
          ? "energy_readings"
          : "water_readings";
    const { error } = await db.from(table).insert({
      ...payload,
      school_id: school!.id,
      ...(route.kind === "telemetry" ? { zone_id: device.zone_id } : {}),
    });
    if (error && error.code !== "23505")
      throw new Error("READING_WRITE_FAILED");
    if (error?.code === "23505") return; // QoS 1 redelivery; do not replay the heartbeat or alerts.
  }
  // Monotonic heartbeat prevents a late packet from rolling back the online timestamp.
  const heartbeat =
    route.kind === "heartbeat" ? heartbeatPayload.parse(payload) : null;
  if (
    !device.last_seen ||
    Date.parse(recorded_at) > Date.parse(device.last_seen)
  ) {
    let query = db
      .from("devices")
      .update({
        last_seen: recorded_at,
        ...(heartbeat?.value !== undefined && actuator
          ? { value: heartbeat.value }
          : {}),
      })
      .eq("id", device_id)
      .eq("active", true)
      .eq("school_id", school!.id);
    if (heartbeat?.value !== undefined && heartbeat.value > 0)
      query = query.neq("mode", "EMERGENCY");
    const { error } = await query.or(
      `last_seen.is.null,last_seen.lt.${recorded_at}`,
    );
    if (error) throw new Error("HEARTBEAT_WRITE_FAILED");
    device.last_seen = recorded_at;
  }
  lastDbOk = Date.now();
  log("message_accepted", {
    kind: route.kind,
    device: device.slug,
    message_id,
  });
}
client.on("message", (topic, bytes, packet) => {
  if (stopping || queued >= 100) {
    log("ingest_queue_full");
    return;
  }
  queued++;
  queue = queue
    .then(() => ingest(topic, bytes, packet.retain))
    .catch((error) =>
      log("ingest_error", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      }),
    )
    .finally(() => {
      queued--;
    });
});
let polling = false;
async function dispatch() {
  if (polling || stopping || !client.connected) return;
  polling = true;
  try {
    const { data: commands, error } = await db.rpc("claim_commands", {
      p_school: school!.id,
    });
    if (error) throw new Error("OUTBOX_READ_FAILED");
    lastDbOk = Date.now();
    for (const command of commands ?? []) {
      const device = devices.get(command.device_id);
      if (
        !device ||
        !["fan", "shade", "irrigation", "hvac", "pump", "ventilation"].includes(
          device.kind,
        ) ||
        Date.parse(command.expires_at) <= Date.now()
      )
        continue;
      const topic = `climateshelter/${env.SCHOOL_SLUG}/control/${device.slug}`;
      // Recheck that an emergency has not superseded this command since claim.
      const { data: current, error: currentError } = await db
        .from("actuator_commands")
        .select("status")
        .eq("id", command.id)
        .single();
      if (currentError || current?.status !== "published") continue;
      await client.publishAsync(
        topic,
        JSON.stringify({
          command_id: command.id,
          sequence: command.sequence,
          device_id: device.id,
          mode: command.mode,
          command_type: command.command_type,
          temperature_setpoint: command.temperature_setpoint,
          humidity_setpoint: command.humidity_setpoint,
          value: command.value,
          duration_seconds: command.duration_seconds,
          issued_at: command.created_at,
          expires_at: command.expires_at,
        }),
        {
          qos: 1,
          retain: false,
          properties: {
            messageExpiryInterval: Math.max(
              1,
              Math.floor((Date.parse(command.expires_at) - Date.now()) / 1000),
            ),
          },
        },
      );
      log("command_published", { command_id: command.id, device: device.slug });
    }
  } catch {
    log("dispatch_failed");
  } finally {
    polling = false;
  }
}
const poll = setInterval(() => void dispatch(), 2000);
const sync = setInterval(() => {
  void syncDevices().catch(() => log("device_sync_failed"));
}, 60000);
const health = createServer((request, response) => {
  if (request.url !== "/healthz") {
    response.writeHead(404);
    response.end();
    return;
  }
  const ready = client.connected && Date.now() - lastDbOk < 60000 && !stopping;
  response.writeHead(ready ? 200 : 503, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify({ ready, mqtt: client.connected }));
}).listen(env.PORT, "0.0.0.0");
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(poll);
  clearInterval(sync);
  health.close();
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  await queue;
  await client.endAsync();
  clearTimeout(force);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
log("bridge_started", { school: env.SCHOOL_SLUG, port: env.PORT });
