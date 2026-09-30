import assert from "node:assert/strict";
import test from "node:test";
import {
  ackPayload,
  commandSchema,
  isFresh,
  parseTopic,
  sensorPayload,
} from "../shared/contracts";
import { counterDelta, csvCell } from "../src/lib/metrics";
const identity = {
  message_id: "40000000-0000-4000-8000-000000000001",
  device_id: "30000000-0000-4000-8000-000000000001",
  recorded_at: new Date().toISOString(),
};
test("accepts bounded telemetry and rejects impossible/extra fields", () => {
  const valid = {
    ...identity,
    temperature: 32,
    humidity: 65,
    wbgt: 28,
    surface_temperature: 38,
    soil_moisture: null,
  };
  assert.equal(sensorPayload.safeParse(valid).success, true);
  for (const patch of [
    { temperature: Infinity },
    { humidity: 101 },
    { wbgt: NaN },
    { surface_temperature: 200 },
    { admin: true },
    { recorded_at: "yesterday" },
  ])
    assert.equal(
      sensorPayload.safeParse({ ...valid, ...patch }).success,
      false,
    );
});
test("command validation blocks injected markup, excessive duration and unexpected fields", () => {
  const valid = {
    deviceId: identity.device_id,
    mode: "MANUAL",
    value: 70,
    durationSeconds: 60,
    reason: "Pengujian kipas",
  };
  assert.equal(commandSchema.safeParse(valid).success, true);
  for (const patch of [
    { value: 101 },
    { durationSeconds: 301 },
    { reason: "<script>alert(1)</script>" },
    { schoolId: "another-school" },
    { mode: "AUTO", value: 90 },
    { mode: "EMERGENCY", value: 1 },
    { mode: "SUPERUSER" },
  ])
    assert.equal(
      commandSchema.safeParse({ ...valid, ...patch }).success,
      false,
    );
});
test("topic parser rejects wildcard, control and malformed topics", () => {
  assert.deepEqual(parseTopic("climateshelter/school01/shelter/telemetry"), {
    school: "school01",
    zone: "shelter",
    kind: "telemetry",
  });
  for (const value of [
    "climateshelter/+/shelter/telemetry",
    "climateshelter/school01/control/fan",
    "climateshelter/school01/shelter/telemetry/extra",
    "climateshelter/../shelter/ack",
  ])
    assert.equal(parseTopic(value), null);
});
test("rejects stale, invalid and excessively future timestamps", () => {
  const now = Date.now();
  assert.equal(isFresh(new Date(now - 60000).toISOString(), now), true);
  assert.equal(isFresh(new Date(now - 121000).toISOString(), now), false);
  assert.equal(isFresh(new Date(now + 31000).toISOString(), now), false);
  assert.equal(isFresh("garbage", now), false);
});
test("ACK accepts only known status and bounded output", () => {
  const ack = {
    ...identity,
    command_id: identity.message_id,
    status: "acknowledged",
    mode: "MANUAL",
    value: 60,
    detail: "Output applied",
  };
  assert.equal(ackPayload.safeParse(ack).success, true);
  assert.equal(ackPayload.safeParse({ ...ack, status: "done" }).success, false);
});
test("energy deltas are per-meter and ignore resets", () => {
  const readings = [
    ["a", 10],
    ["b", 100],
    ["a", 12],
    ["a", 1],
    ["b", 103],
    ["a", 2],
  ].map(([device_id, value], i) => ({
    device_id: String(device_id),
    recorded_at: new Date(i * 1000).toISOString(),
    energy_kwh: value,
  }));
  assert.equal(counterDelta(readings, "energy_kwh"), 6);
});
test("CSV escapes quotes and formula injection", () => {
  assert.equal(csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
  assert.equal(csvCell("Taman, A"), '"Taman, A"');
});
