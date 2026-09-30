import assert from "node:assert/strict";
const base = process.env.SMOKE_ORIGIN ?? "http://localhost:3000";
const target = new URL(base);
if (!["localhost", "127.0.0.1"].includes(target.hostname))
  throw new Error("Smoke test only runs against loopback demo.");
const report = [];
async function check(name, fn) {
  await fn();
  report.push(name);
  console.log("PASS " + name);
}
async function request(path, body, cookie = "", origin = base) {
  return fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: origin }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
}
const publicResponse = await request("/api/public"),
  publicData = await publicResponse.json();
assert.equal(
  publicData[0]?.demo,
  true,
  "Requires demo server. No live changes will be made.",
);
await check("Anonymous access is restricted", async () => {
  assert.equal((await request("/api/dashboard")).status, 401);
  const r = await request("/dashboard");
  assert.ok([303, 307].includes(r.status));
  assert.equal(r.headers.get("location"), "/login");
});
await check("Public projection has no internal data", async () => {
  const s = JSON.stringify(publicData);
  for (const key of [
    "key_hash",
    "requested_by",
    "actuator_commands",
    "user_id",
    "email",
    "devices",
    "last_seen",
    "firmware",
  ])
    assert.ok(!s.includes(key));
});
await check("Cross-origin login is rejected", async () => {
  assert.equal(
    (
      await request(
        "/api/auth/login",
        { demoRole: "admin" },
        "",
        "https://untrusted.example",
      )
    ).status,
    403,
  );
});
async function login(role) {
  const r = await request("/api/auth/login", { demoRole: role });
  assert.equal(r.status, 200);
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
const op = await login("operator");
const data = await (await request("/api/dashboard", undefined, op)).json();
const fan = data.devices.find((d) => d.kind === "fan");
await check(
  "User dashboard is read only and excludes operational data",
  async () => {
    const cookie = await login("public");
    const d = await (await request("/api/dashboard", undefined, cookie)).json();
    for (const key of [
      "devices",
      "commands",
      "logs",
      "controls",
      "activity",
      "members",
    ])
      assert.deepEqual(d[key], []);
    const html = await (await request("/dashboard", undefined, cookie)).text();
    assert.ok(html.includes("STATUS RUANGAN"));
    assert.ok(html.includes("Kualitas Udara"));
    assert.ok(!html.includes("Halaman belum dapat dimuat"));
    for (const view of [
      "devices",
      "control",
      "activity",
      "settings",
      "users",
      "schools",
    ]) {
      const r = await request("/dashboard/" + view, undefined, cookie);
      const body = await r.text();
      assert.ok(
        r.status === 404 || body.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
        view + " must be blocked",
      );
    }
    for (const kind of ["fan", "hvac", "ventilation"]) {
      const device = data.devices.find((v) => v.kind === kind);
      assert.ok(device);
      assert.equal(
        (
          await request(
            "/api/commands",
            {
              deviceId: device.id,
              mode: "MANUAL",
              value: 30,
              durationSeconds: 60,
              reason: "Reader must be blocked",
            },
            cookie,
          )
        ).status,
        403,
      );
    }
    assert.equal(
      (
        await request(
          "/api/manage/setpoint",
          {
            deviceId: fan.id,
            temperature: 27,
            humidity: 60,
            reason: "Reader denied",
          },
          cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/api/manage/settings",
          {
            schoolId: d.school.id,
            temperatureWarning: 32,
            co2Warning: 800,
            co2Critical: 1200,
            pm25Warning: 35,
            pm25Critical: 75,
            pcmMeltStart: 26,
            pcmMeltEnd: 28,
            allowOperatorSetpoints: true,
          },
          cookie,
        )
      ).status,
      403,
    );
    await request("/api/auth/logout", {}, cookie);
  },
);
await check("Operator cannot access admin mutations", async () => {
  assert.equal(
    (
      await request(
        "/api/manage/device",
        {
          schoolId: data.school.id,
          zoneId: fan.zone_id,
          name: "Test device",
          slug: "test-device",
          kind: "sensor",
          location: "Test zone",
          firmwareVersion: "1.0",
          active: true,
        },
        op,
      )
    ).status,
    403,
  );
});
await check(
  "Control validates payload and logs accepted commands",
  async () => {
    assert.equal(
      (
        await request(
          "/api/commands",
          {
            deviceId: fan.id,
            mode: "MANUAL",
            value: 30,
            durationSeconds: 600,
            reason: "Smoke test",
          },
          op,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/commands",
          {
            deviceId: fan.id,
            mode: "MANUAL",
            value: 30,
            durationSeconds: 60,
            reason: "Smoke test control",
          },
          op,
        )
      ).status,
      200,
    );
    const d = await (await request("/api/dashboard", undefined, op)).json();
    assert.equal(d.devices.find((v) => v.id === fan.id).value, 30);
    assert.ok(d.activity.some((a) => a.action === "command.simulated"));
  },
);
await check("Alert resolve is persisted in the session", async () => {
  const a = data.alerts[0];
  assert.equal(
    (await request("/api/alerts", { id: a.id, action: "resolve" }, op)).status,
    200,
  );
  const d = await (await request("/api/dashboard", undefined, op)).json();
  assert.ok(d.alerts.find((v) => v.id === a.id).resolved_at);
});
await check(
  "Setpoint control and emergency recovery enforce roles",
  async () => {
    assert.equal(
      (
        await request(
          "/api/manage/setpoint",
          {
            deviceId: fan.id,
            temperature: 27,
            humidity: 60,
            reason: "Smoke setpoint",
          },
          op,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/api/commands",
          {
            deviceId: fan.id,
            mode: "EMERGENCY",
            value: 0,
            durationSeconds: 60,
            reason: "Smoke emergency",
          },
          op,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/api/commands",
          {
            deviceId: fan.id,
            mode: "AUTO",
            value: 0,
            durationSeconds: 60,
            reason: "Unauthorized recovery",
          },
          op,
        )
      ).status,
      409,
    );
  },
);
await check("Demo sessions are isolated", async () => {
  const admin = await login("admin");
  const page = await (await request("/dashboard", undefined, admin)).text();
  assert.ok(
    page.includes("Perangkat aktif") &&
      !page.includes("Halaman belum dapat dimuat"),
  );
  const d = await (await request("/api/dashboard", undefined, admin)).json();
  assert.equal(d.commands.length, 0);
  await request("/api/auth/logout", {}, admin);
});
await check(
  "Super admin can switch schools without losing simulation",
  async () => {
    const sup = await login("super_admin");
    const page = await (await request("/dashboard", undefined, sup)).text();
    assert.ok(
      page.includes("School Management") &&
        !page.includes("Halaman belum dapat dimuat"),
    );
    const d = await (await request("/api/dashboard", undefined, sup)).json();
    assert.equal(d.schools.length, 2);
    const other = d.schools.find((s) => s.id !== d.school.id);
    assert.equal(
      (await request("/api/manage/select", { schoolId: other.id }, sup)).status,
      200,
    );
    const next = await (await request("/api/dashboard", undefined, sup)).json();
    assert.equal(next.school.id, other.id);
    assert.equal(next.devices.length, 0);
    assert.equal(
      (await request("/api/manage/select", { schoolId: d.school.id }, sup))
        .status,
      200,
    );
    const back = await (await request("/api/dashboard", undefined, sup)).json();
    assert.equal(back.devices.length, d.devices.length);
    await request("/api/auth/logout", {}, sup);
  },
);
await check("Dashboard routes render successfully", async () => {
  for (const path of [
    "/dashboard",
    "/dashboard/live",
    "/dashboard/analytics",
    "/dashboard/control",
    "/dashboard/devices",
    "/dashboard/alerts",
    "/dashboard/reports",
    "/dashboard/settings",
  ]) {
    const r = await request(path, undefined, op);
    assert.equal(r.status, 200, path);
    const html = await r.text();
    assert.ok(!html.includes("NEXT_HTTP_ERROR_FALLBACK"), path);
    assert.ok(!html.includes("Halaman belum dapat dimuat"), path);
  }
});
await check("Logout revokes demo session", async () => {
  assert.equal((await request("/api/auth/logout", {}, op)).status, 200);
  assert.equal((await request("/api/dashboard", undefined, op)).status, 401);
});
console.log(report.length + " HTTP checks passed.");
