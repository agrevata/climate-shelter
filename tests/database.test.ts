import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("migration, seed, tenant isolation, role authorization and outbox lifecycle", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon,service_role;
      grant execute on function auth.uid() to authenticated,anon,service_role;
      create publication supabase_realtime;
    `);
    const migration = readFileSync(
      new URL("../supabase/migrations/001_initial.sql", import.meta.url),
      "utf8",
    ).replace(
      "create extension if not exists pgcrypto;",
      "-- gen_random_uuid is built into PostgreSQL; PGlite has no pgcrypto extension.",
    );
    await db.exec(migration);
    await db.exec(
      readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
    );
    const school = "10000000-0000-4000-8000-000000000001";
    const admin = "60000000-0000-4000-8000-000000000001",
      operator = "60000000-0000-4000-8000-000000000002",
      viewer = "60000000-0000-4000-8000-000000000003",
      outsider = "60000000-0000-4000-8000-000000000004";
    const fan = "30000000-0000-4000-8000-000000000005";
    await db.exec(`insert into auth.users values('${admin}'),('${operator}'),('${viewer}'),('${outsider}');
      insert into public.school_members(school_id,user_id,role) values('${school}','${admin}','admin'),('${school}','${operator}','operator'),('${school}','${viewer}','viewer');
      update public.devices set last_seen=now() where kind in ('fan','shade','irrigation');`);
    const identity = async (id: string) => {
      await db.exec(
        `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`,
      );
    };
    await identity(outsider);
    assert.equal(
      (await db.query("select * from public.schools")).rows.length,
      0,
      "other users cannot read this school",
    );
    assert.equal(
      (await db.query("select * from public.sensor_readings")).rows.length,
      0,
      "telemetry protected by RLS",
    );
    await assert.rejects(
      db.query(
        `select public.request_actuator('${fan}','MANUAL',20,60,'Unauthorized')`,
      ),
    );
    await identity(viewer);
    assert.equal(
      (await db.query("select * from public.schools")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.sensor_readings")).rows.length,
      672,
      "seed is idempotent",
    );
    await assert.rejects(
      db.query(
        `update public.school_members set role='admin' where user_id='${viewer}'`,
      ),
    );
    await assert.rejects(
      db.query(
        `select public.request_actuator('${fan}','MANUAL',20,60,'Viewer blocked')`,
      ),
    );
    await assert.rejects(
      db.query(`select * from public.claim_commands('${school}')`),
    );
    await identity(operator);
    const result = await db.query<{ id: string }>(
      `select public.request_actuator('${fan}','MANUAL',65,60,'Operator control') as id`,
    );
    const id = result.rows[0].id;
    await assert.rejects(
      db.query(
        `select public.request_actuator('${fan}','MANUAL',30,60,'Pending duplicate')`,
      ),
    );
    await db.exec("reset role;set role service_role;");
    assert.equal(
      (await db.query(`select * from public.claim_commands('${school}')`)).rows
        .length,
      1,
    );
    await assert.rejects(
      db.query(
        `select public.confirm_command('${school}','30000000-0000-4000-8000-000000000006','${id}','acknowledged','MANUAL',65,'Wrong target')`,
      ),
    );
    await assert.rejects(
      db.query(
        `select public.confirm_command('${school}','${fan}','${id}','acknowledged','MANUAL',100,'Wrong output')`,
      ),
    );
    await db.query(
      `select public.confirm_command('${school}','${fan}','${id}','acknowledged','MANUAL',65,'Applied')`,
    );
    await db.query(
      `select public.confirm_command('${school}','${fan}','${id}','acknowledged','MANUAL',65,'Duplicate')`,
    );
    assert.equal(
      (
        await db.query<{ value: number }>(
          `select value from public.devices where id='${fan}'`,
        )
      ).rows[0].value,
      65,
    );
    assert.equal(
      (
        await db.query(
          `select * from public.actuator_logs where command_id='${id}' and event='acknowledged'`,
        )
      ).rows.length,
      1,
    );
    await identity(operator);
    const emergency = (
      await db.query<{ id: string }>(
        `select public.request_actuator('${fan}','EMERGENCY',0,60,'Emergency stop') as id`,
      )
    ).rows[0].id;
    await db.exec("reset role;set role service_role;");
    await db.query(
      `select public.confirm_command('${school}','${fan}','${emergency}','acknowledged','EMERGENCY',0,'Stopped')`,
    );
    await identity(operator);
    await assert.rejects(
      db.query(
        `select public.request_actuator('${fan}','AUTO',0,60,'Cannot release latch')`,
      ),
    );
    await identity(admin);
    const recovery = (
      await db.query<{ id: string }>(
        `select public.request_actuator('${fan}','AUTO',0,60,'Inspection complete') as id`,
      )
    ).rows[0].id;
    await db.exec("reset role;set role service_role;");
    await db.query(
      `select public.confirm_command('${school}','${fan}','${recovery}','acknowledged','AUTO',60,'Recovery applied')`,
    );
    await identity(operator);
    const unconfirmed = (
      await db.query<{ id: string }>(
        `select public.request_actuator('${fan}','EMERGENCY',0,60,'Emergency without ACK') as id`,
      )
    ).rows[0].id;
    await db.exec("reset role;");
    await db.query(
      `update public.actuator_commands set expires_at=now()-interval '1 second' where id='${unconfirmed}'`,
    );
    await db.exec("set role service_role;");
    await db.query(`select * from public.claim_commands('${school}')`);
    await identity(operator);
    await assert.rejects(
      db.query(
        `select public.request_actuator('${fan}','MANUAL',50,60,'Expired emergency remains latched')`,
      ),
    );
    const valve = "30000000-0000-4000-8000-000000000007";
    await assert.rejects(
      db.query(
        `select public.request_actuator('${valve}','MANUAL',100,60,'Stale water interlock')`,
      ),
    );
    await db.exec("reset role;");
    await db.exec(`insert into public.water_readings(school_id,device_id,recorded_at,tank_level,stored_liters,used_liters,harvested_liters) values
      ('${school}','30000000-0000-4000-8000-000000000009',now()-interval '30 seconds',80,800,1000,2000),
      ('${school}','30000000-0000-4000-8000-000000000009',now(),10,100,1000,2000);`);
    await identity(operator);
    await assert.rejects(
      db.query(
        `select public.request_actuator('${valve}','MANUAL',100,60,'Latest water is low')`,
      ),
    );
    await db.exec("reset role;");
    await db.exec(
      `update public.devices set last_seen=now()-interval '3 minutes' where id='${valve}'`,
    );
    await identity(admin);
    await assert.rejects(
      db.query(
        `select public.request_actuator('${valve}','AUTO',0,60,'Offline must reject')`,
      ),
    );
    const history = (
      await db.query<{ data: unknown[] }>(
        `select public.dashboard_sensor_history('${school}') as data`,
      )
    ).rows[0].data;
    assert.ok(history.length >= 660 && history.length <= 672);
    await db.exec("reset role;set role anon;");
    await assert.rejects(db.query("select * from public.devices"));
    await assert.rejects(
      db.query(
        `select public.request_actuator('${fan}','MANUAL',20,60,'Anon blocked')`,
      ),
    );
  } finally {
    await db.close();
  }
});
