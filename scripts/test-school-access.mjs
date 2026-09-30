import assert from "node:assert/strict";
const base = process.env.SMOKE_ORIGIN ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Local demo test only");
async function request(path, cookie = "", body) {
  return fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
}
const sessions = [];
const other = "10000000-0000-4000-8000-000000000099";
try {
  for (const role of ["operator", "admin", "super_admin"]) {
    const login = await request("/api/auth/login", "", { demoRole: role });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).demo, true, "Never mutate production accounts");
    const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    sessions.push(cookie);
    const data = await (await request("/api/dashboard", cookie)).json();
    const html = await (await request("/dashboard", cookie)).text();
    assert.ok(!html.includes('aria-label="Sekolah aktif"'), `${role}: no school switch`);
    assert.ok(html.includes("Lokasi di sekolah"), `${role}: location selector remains`);
    if (role !== "super_admin") {
      for (const schoolId of [data.school.id, other])
        assert.equal((await request("/api/manage/select", cookie, { schoolId })).status, 403);
      assert.equal((await request("/api/manage/member", cookie, {
        schoolId: data.school.id, email: "school-scope@example.test", role: "operator", action: "grant",
      })).status, 403);
      const forged = await (await request("/api/dashboard", cookie + "; climate_school=" + other)).json();
      assert.equal(forged.school.id, data.school.id, "school cookie cannot change assigned school");
      assert.equal((await request("/api/commands", cookie, {
        deviceId: "30000000-0000-4000-8000-000000000099", mode: "MANUAL", value: 100,
        durationSeconds: 60, reason: "Foreign device rejected",
      })).status, 403);
    } else {
      assert.equal((await request("/api/manage/school", cookie, {
        id: other, name: "Sekolah uji sesi", slug: "school-scope-test", location: "Demo lokal",
        latitude: null, longitude: null, isPublic: false,
      })).status, 200);
      assert.equal((await request("/api/manage/member", cookie, {
        schoolId: data.school.id, email: "school-scope@example.test", role: "operator", action: "grant",
      })).status, 200);
      assert.equal((await request("/api/manage/select", cookie, { schoolId: other })).status, 200);
      const switched = await (await request("/api/dashboard", cookie)).json();
      assert.equal(switched.school.id, other);
      assert.equal(switched.wokwi, undefined, "other school receives no Candigaron controller");
      assert.equal((await request("/api/wokwi/config", cookie, { location_id: "shelter", setpoint: 26.7 })).status, 409);
      assert.equal((await request("/api/manage/member", cookie, {
        schoolId: other, email: "school-scope@example.test", role: "operator", action: "grant",
      })).status, 409, "same account cannot be assigned to two schools");
    }
    console.log(`PASS ${role}: school scope and dashboard selector`);
  }
} finally {
  for (const cookie of sessions) await request("/api/auth/logout", cookie, {});
}
