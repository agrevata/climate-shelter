import assert from "node:assert/strict";
import test from "node:test";
import {
  getAirQualityStatus,
  getOverallRoomStatus,
  temperatureStatus,
  humidityStatus,
  thermalScoreStatus,
  pcmPhaseStatus,
  telemetryState,
} from "../shared/status-config";
import { canAccessDashboardView } from "../shared/monitoring-access";
import { relativeUpdate } from "../src/lib/metrics";
test("monitoring boundaries, missing data and worst air-quality severity", () => {
  assert.equal(temperatureStatus(20).label, "Nyaman");
  assert.equal(temperatureStatus(27).label, "Nyaman");
  assert.equal(temperatureStatus(30).label, "Hangat");
  assert.equal(temperatureStatus(30.1).label, "Panas");
  assert.equal(humidityStatus(70).label, "Normal");
  assert.equal(thermalScoreStatus(85).label, "Nyaman");
  for (const pair of [
    [1300, 10],
    [600, 80],
  ])
    assert.equal(
      getAirQualityStatus(...(pair as [number, number])).label,
      "Buruk",
    );
  assert.equal(getAirQualityStatus(900, 50).label, "Sedang");
  assert.equal(getAirQualityStatus(800, 35).label, "Baik");
  assert.equal(getAirQualityStatus(null, 10).label, "Belum tersedia");
  assert.equal(getAirQualityStatus(600, NaN).label, "Belum tersedia");
  assert.equal(getOverallRoomStatus(25, 60, 600, 80, 80).label, "Tidak Ideal");
  assert.equal(getOverallRoomStatus(25, 60, 600, 10, 50).label, "Tidak Ideal");
  assert.equal(
    getOverallRoomStatus(19, 60, 600, 10, 80).label,
    "Perlu Perhatian",
  );
  assert.equal(
    getOverallRoomStatus(25, 60, 600, 10, undefined).label,
    "Belum tersedia",
  );
  assert.equal(getOverallRoomStatus(25, 60, 600, 10, 80).label, "Nyaman");
  assert.equal(pcmPhaseStatus(26, 26, 28).label, "Transition");
  assert.equal(pcmPhaseStatus(29, 26, 28).label, "Liquid");
  assert.equal(pcmPhaseStatus(25, 26, 28).label, "Solid");
});
test("freshness is based on telemetry time, never fetch time", () => {
  const timestamp = "2026-09-28T00:00:00Z",
    now = Date.parse(timestamp);
  assert.equal(telemetryState(timestamp, now + 120001), "offline");
  assert.equal(telemetryState(timestamp, now + 120000), "fresh");
  assert.equal(telemetryState(undefined, now), "empty");
  assert.equal(relativeUpdate(timestamp, now + 5000), "5 detik lalu");
  assert.equal(relativeUpdate(timestamp, now + 61000), "1 menit lalu");
});
test("User routes are read only; operational roles retain their views", () => {
  for (const role of ["public", "viewer"]) {
    for (const view of ["overview", "live", "analytics", "history", "alerts"])
      assert.ok(canAccessDashboardView(role, view));
    for (const view of [
      "devices",
      "control",
      "activity",
      "settings",
      "users",
      "schools",
    ])
      assert.equal(canAccessDashboardView(role, view), false);
  }
  for (const role of ["operator", "admin", "super_admin"])
    assert.ok(canAccessDashboardView(role, "control"));
  assert.equal(canAccessDashboardView("operator", "users"), false);
  assert.ok(canAccessDashboardView("super_admin", "schools"));
});
