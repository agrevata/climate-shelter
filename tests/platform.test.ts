import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  iotSensorSchema,
  thresholdsSchema,
  setpointSchema,
} from "../shared/platform";
test("HTTP telemetry accepts optional sensors and rejects spoofed fields and invalid ranges", () => {
  const p = {
    device_id: "sensor-shelter",
    message_id: "50000000-0000-4000-8000-000000000001",
    temperature: 29,
    humidity: 65,
  };
  assert.equal(iotSensorSchema.safeParse(p).success, true);
  for (const extra of [
    { co2: -1 },
    { pm25: 1001 },
    { school_id: "other" },
    { temperature: NaN },
    { energy: -1 },
    { pcm_temperature: 101 },
  ])
    assert.equal(iotSensorSchema.safeParse({ ...p, ...extra }).success, false);
  assert.equal(
    setpointSchema.safeParse({
      deviceId: "30000000-0000-4000-8000-000000000005",
      temperature: 16,
      humidity: 65,
      reason: "Too cold",
    }).success,
    false,
  );
  assert.equal(
    thresholdsSchema.safeParse({
      schoolId: "10000000-0000-4000-8000-000000000001",
      temperatureWarning: 32,
      co2Warning: 1500,
      co2Critical: 1000,
      pm25Warning: 35,
      pm25Critical: 75,
      pcmMeltStart: 26,
      pcmMeltEnd: 28,
      allowOperatorSetpoints: true,
    }).success,
    false,
  );
});
test("hybrid migration: public projection, cross-school RLS, privilege boundaries, device key and ACK", async () => {
  const db = new PGlite();
  const school = "10000000-0000-4000-8000-000000000001",
    other = "10000000-0000-4000-8000-000000000002",
    fan = "30000000-0000-4000-8000-000000000005",
    sensor = "30000000-0000-4000-8000-000000000002";
  const admin = "60000000-0000-4000-8000-000000000001",
    op = "60000000-0000-4000-8000-000000000002",
    sup = "60000000-0000-4000-8000-000000000003",
    outsider = "60000000-0000-4000-8000-000000000004",
    reader = "60000000-0000-4000-8000-000000000005";
  const identity = async (id: string) =>
    db.exec(
      "reset role;select set_config('request.jwt.claim.sub','" +
        id +
        "',false);set role authenticated;",
    );
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create publication supabase_realtime;",
    );
    const sql = (name: string) =>
      readFileSync(new URL("../supabase/" + name, import.meta.url), "utf8");
    await db.exec(
      sql("migrations/001_initial.sql").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
    await db.exec(sql("seed.sql"));
    await db.exec(sql("migrations/002_hybrid_platform.sql"));
    await db.exec(sql("migrations/003_user_monitoring.sql"));
    await db.exec(sql("migrations/004_account_school_scope.sql"));
    await db.exec(sql("seed-hybrid.sql"));
    await db.exec(sql("seed-hybrid.sql"));
    await db.exec(
      "insert into auth.users values('" +
        admin +
        "','admin@example.test'),('" +
        op +
        "','op@example.test'),('" +
        sup +
        "','super@example.test'),('" +
        outsider +
        "','outside@example.test'),('" +
        reader +
        "','reader@example.test');insert into public.school_members(school_id,user_id,role) values('" +
        school +
        "','" +
        admin +
        "','admin'),('" +
        school +
        "','" +
        op +
        "','operator'),('" +
        school +
        "','" +
        reader +
        "','public');update public.profiles set role='super_admin' where id='" +
        sup +
        "';update public.devices set last_seen=now();update public.schools set is_public=true where id='" +
        school +
        "';",
    );
    await identity(reader);
    for (const table of [
      "devices",
      "actuator_commands",
      "actuator_logs",
      "device_controls",
      "activity_logs",
    ]) {
      assert.equal(
        (await db.query(`select * from public.${table}`)).rows.length,
        0,
        `User cannot read ${table}`,
      );
    }
    assert.ok(
      (await db.query("select * from public.sensor_readings")).rows.length > 0,
    );
    assert.equal(
      (await db.query("select * from public.schools")).rows.length,
      1,
      "public membership retains read-only school access",
    );
    await assert.rejects(
      db.query(
        "select public.request_actuator('" +
          fan +
          "','MANUAL',30,60,'Denied reader')",
      ),
    );
    await identity(op);
    assert.ok(
      (await db.query("select * from public.devices")).rows.length > 0,
      "operator retains device access",
    );
    await assert.rejects(
      db.query(
        "update public.profiles set role='super_admin' where id='" + op + "'",
      ),
    );
    await assert.rejects(
      db.query(
        'select public.admin_settings(\'{ "schoolId":"' +
          school +
          "\" }'::jsonb)",
      ),
    );
    await assert.rejects(
      db.query(
        "select public.issue_device_key('" + sensor + "',repeat('a',64))",
      ),
    );
    await assert.rejects(db.query("select * from public.device_credentials"));
    await identity(admin);
    await assert.rejects(db.query(`select public.admin_member('${school}','outside@example.test','operator','grant')`), /Hanya super admin/);
    await assert.rejects(
      db.query(
        "select public.admin_member('" +
          school +
          "','outside@example.test','admin','grant')",
      ),
    );
    await assert.rejects(db.query("select public.admin_school('{}')"));
    const key = (
      await db.query<{ id: string }>(
        "select public.issue_device_key('" + sensor + "',repeat('a',64)) as id",
      )
    ).rows[0].id;
    await db.exec("reset role;set role service_role;");
    await assert.rejects(
      db.query("select public.authorize_device('" + key + "',repeat('b',64))"),
    );
    assert.equal(
      (
        await db.query<{ id: string }>(
          "select public.authorize_device('" + key + "',repeat('a',64)) as id",
        )
      ).rows[0].id,
      sensor,
    );
    const payload = JSON.stringify({
      device_id: "sensor-shelter",
      message_id: "50000000-0000-4000-8000-000000000080",
      temperature: 33,
      humidity: 67,
      co2: 1700,
      pm25: 80,
      pcm_temperature: 27,
      recorded_at: "2020-01-01T00:00:00Z",
    });
    const ingest = () =>
      db.query<{ id: string }>(
        "select public.ingest_device_reading('" +
          sensor +
          "','" +
          payload +
          "'::jsonb) as id",
      );
    const rid = (await ingest()).rows[0].id;
    assert.equal(
      (await ingest()).rows[0].id,
      rid,
      "duplicate message is idempotent",
    );
    const sample = (
      await db.query<{ recent: boolean; co2: number }>(
        "select recorded_at>now()-interval '1 minute' as recent,co2 from public.sensor_readings where id='" +
          rid +
          "'",
      )
    ).rows[0];
    assert.equal(sample.recent, true, "server chooses ingest time");
    assert.equal(sample.co2, 1700);
    assert.ok(
      (
        await db.query(
          "select * from public.alerts where sensor_type='co2' and severity='critical'",
        )
      ).rows.length,
    );
    await assert.rejects(
      db.query(
        "select public.ingest_device_reading('" +
          sensor +
          "','" +
          payload.replace("sensor-shelter", "sensor-outside") +
          "'::jsonb)",
      ),
    );
    await db.exec("reset role;set role anon;");
    const publicRows = (
      await db.query<{ payload: Record<string, unknown> }>(
        "select payload from public.public_monitoring",
      )
    ).rows;
    assert.equal(publicRows.length, 1);
    const publicText = JSON.stringify(publicRows);
    for (const secret of [
      "key_hash",
      "requested_by",
      "email",
      "activity_logs",
      "actuator_commands",
      "device_id",
      "zone_id",
      "devices",
      "last_seen",
      "firmware",
    ])
      assert.ok(!publicText.includes(secret), "public DTO excludes " + secret);
    await assert.rejects(db.query("select * from public.sensor_readings"));
    await assert.rejects(db.query("select * from public.device_credentials"));
    await assert.rejects(
      db.query("select public.authorize_device('" + key + "',repeat('a',64))"),
    );
    await identity(outsider);
    assert.equal(
      (await db.query("select * from public.schools")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select public.sensor_history('" + school + "',24) as result",
        )
      ).rows[0].result instanceof Array,
      true,
    );
    await assert.rejects(
      db.query(
        "select public.request_setpoints('" + fan + "',27,60,'Wrong school')",
      ),
    );
    await identity(sup);
    await db.query(
      "select public.admin_school('" +
        JSON.stringify({
          id: other,
          name: "Other School",
          slug: "other-school",
          location: "Bandung",
          latitude: -6.9,
          longitude: 107.6,
          isPublic: false,
        }) +
        "')",
    );
    assert.equal(
      (await db.query("select * from public.schools")).rows.length,
      2,
    );
    await db.query(
      "select public.admin_member('" +
        other +
        "','outside@example.test','admin','grant')",
    );
    await assert.rejects(db.query(`select public.admin_member('${other}','op@example.test','operator','grant')`), /sekolah lain/);
    const otherZone = (await db.query<{id: string}>(`select id from public.zones where school_id='${other}' limit 1`)).rows[0].id;
    const otherFan = (await db.query<{id: string}>(`select public.admin_device('${JSON.stringify({
      schoolId: other, zoneId: otherZone, name: "Fan sekolah B", slug: "fan-other",
      kind: "fan", location: "Shelter", firmwareVersion: "test", active: true,
    })}'::jsonb) as id`)).rows[0].id;
    await identity(op);
    assert.equal((await db.query(`select * from public.devices where id='${otherFan}'`)).rows.length, 0);
    await assert.rejects(db.query(`select public.request_actuator('${otherFan}','MANUAL',30,60,'Cross school denied')`), /Akses/);
    await assert.rejects(db.query(`select public.request_setpoints('${otherFan}',27,60,'Cross school denied')`));
    await assert.rejects(db.query(`select public.admin_member('${school}','op@example.test','admin','grant')`), /Hanya super admin/);
    await identity(outsider);
    await assert.rejects(db.query(`select public.request_actuator('${fan}','MANUAL',30,60,'School B cannot control A')`), /Akses/);
    await assert.rejects(db.query(`select public.admin_member('${other}','reader@example.test','operator','grant')`), /Hanya super admin/);
    await identity(sup);
    await db.query(`select public.admin_member('${school}','op@example.test','operator','revoke')`);
    await identity(op);
    assert.equal((await db.query(`select * from public.schools`)).rows.length, 0, "revoked account immediately loses school access");
    await assert.rejects(db.query(`select public.request_actuator('${fan}','MANUAL',30,60,'Revoked operator denied')`));
    await identity(sup);
    await db.query(`select public.admin_member('${other}','op@example.test','operator','grant')`);
    await identity(op);
    assert.deepEqual((await db.query<{id: string}>(`select id from public.schools`)).rows.map(s => s.id), [other]);
    await assert.rejects(db.query(`select public.request_setpoints('${fan}',27,60,'Old school now denied')`));
    await identity(sup);
    await db.query(`select public.admin_member('${other}','op@example.test','operator','revoke')`);
    await db.query(`select public.admin_member('${school}','op@example.test','operator','grant')`);
    await identity(admin);
    assert.equal(
      (await db.query("select * from public.schools where id='" + other + "'"))
        .rows.length,
      0,
    );
    await identity(op);
    const cmd = (
      await db.query<{ id: string }>(
        "select public.request_setpoints('" +
          fan +
          "',27,60,'Operator setpoint') as id",
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query<{ temperature_setpoint: number }>(
          "select temperature_setpoint from public.device_controls where device_id='" +
            fan +
            "'",
        )
      ).rows[0].temperature_setpoint,
      28,
      "pending does not change confirmed state",
    );
    await db.exec("reset role;set role service_role;");
    await db.query("select * from public.device_command_queue('" + fan + "')");
    await db.query(
      "select public.confirm_command('" +
        school +
        "','" +
        fan +
        "','" +
        cmd +
        "','acknowledged','AUTO',0,'Applied setpoint',27,60)",
    );
    assert.equal(
      (
        await db.query<{ temperature_setpoint: number }>(
          "select temperature_setpoint from public.device_controls where device_id='" +
            fan +
            "'",
        )
      ).rows[0].temperature_setpoint,
      27,
    );
    await identity(admin);
    const rotated = (
      await db.query<{ id: string }>(
        "select public.issue_device_key('" + sensor + "',repeat('c',64)) as id",
      )
    ).rows[0].id;
    assert.notEqual(rotated, key);
    await db.exec("reset role;set role service_role;");
    await assert.rejects(
      db.query("select public.authorize_device('" + key + "',repeat('a',64))"),
    );
    await db.exec(
      "reset role;update public.schools set is_public=false where id='" +
        school +
        "';set role anon;",
    );
    assert.equal(
      (await db.query("select * from public.public_monitoring")).rows.length,
      0,
      "unpublishing removes projection",
    );
  } finally {
    await db.close();
  }
});
