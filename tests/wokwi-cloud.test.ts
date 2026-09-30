import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { wokwiTelemetrySchema } from '../shared/wokwi';

const setup = readFileSync(new URL('../supabase/SETUP-SUPABASE.sql', import.meta.url), 'utf8')
  .replace('create extension if not exists pgcrypto;', '');
const bootstrap = `create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public,auth to authenticated,anon,service_role;
  grant execute on function auth.uid() to authenticated,anon,service_role;
  create publication supabase_realtime;`;
const school = '10000000-0000-4000-8000-000000000001';
const shelter = '30000000-0000-4000-8000-000000000002';
const room = '30000000-0000-4000-8000-000000000004';
const fan = '30000000-0000-4000-8000-000000000005';
const op = '60000000-0000-4000-8000-000000000001';
const admin = '60000000-0000-4000-8000-000000000002';
const outsider = '60000000-0000-4000-8000-000000000003';
const reader = '60000000-0000-4000-8000-000000000004';
const otherSchool = '10000000-0000-4000-8000-000000000099';
const packet = (location: 'shelter'|'classroom') => ({
  device_id: `climate-${location}-esp32`, location_id: location, message_id: randomUUID(),
  temperature: 30, humidity: 65, co2: 800, pm25: 12, pcm_temperature: 27,
  light_lux: 350, occupancy: true, sensor_ok: true, tank_ok: true,
  fan_on: true, pump_on: true, hvac_on: false,
  ventilation_degrees: location==='classroom' ? 90 : 0,
  setpoint: 26.7, firmware_version: 'climate-wokwi-3.0',
});

test('cloud SQL: fresh installation, durable two-location ingest, privacy, setpoint permissions and safe rerun', async () => {
  const db = new PGlite();
  const identity = async (id: string) => {
    await db.exec('reset role;');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec('set role authenticated;');
  };
  const service = () => db.exec('reset role; set role service_role;');
  const ingest = (id: string, payload: object) => db.query<{result: Record<string, unknown>}>(
    'select public.ingest_wokwi_telemetry($1,$2::jsonb) as result', [id, JSON.stringify(payload)]);
  try {
    await db.exec(bootstrap);
    const install = await db.exec(setup);
    assert.deepEqual(install.at(-1)?.rows[0], {status:'SIAP',sekolah:1,lokasi:2,esp32:2,aktuator:6,pembacaan_sensor:0,rls_aktif:true});
    assert.equal((await db.query('select * from public.device_credentials')).rows.length,0);
    assert.equal((await db.query('select * from public.devices where last_seen is not null')).rows.length,0);
    assert.equal((await db.query('select * from public.public_monitoring')).rows.length,0);
    await db.exec(`insert into auth.users(id,email) values
      ('${op}','op@example.test'),('${admin}','admin@example.test'),('${outsider}','other@example.test'),('${reader}','reader@example.test');
      insert into public.schools(id,slug,name) values('${otherSchool}','school-b','School B');
      insert into public.school_members(school_id,user_id,role) values
      ('${school}','${op}','operator'),('${school}','${admin}','admin'),('${school}','${reader}','public'),('${otherSchool}','${outsider}','operator');`);

    await service();
    const a = packet('shelter'), b = {...packet('classroom'), temperature:32, hvac_on:true};
    assert.equal(wokwiTelemetrySchema.safeParse(a).success,true);
    assert.equal(wokwiTelemetrySchema.safeParse(b).success,true);
    const first = (await ingest(shelter,a)).rows[0].result;
    assert.equal(first.ok,true);
    assert.equal(first.setpoint,26.7);
    assert.deepEqual((await ingest(shelter,a)).rows[0].result,first,'duplicate delivery does not refresh heartbeat');
    await ingest(room,b);
    assert.deepEqual((await db.query<{location_id:string,temp:number}>("select location_id,(latest_payload->>'temperature')::int as temp from public.wokwi_controllers order by location_id")).rows,
      [{location_id:'classroom',temp:32},{location_id:'shelter',temp:30}]);
    assert.equal((await db.query('select * from public.sensor_readings')).rows.length,2);
    assert.equal((await db.query('select * from public.devices where last_seen is not null')).rows.length,8);
    await assert.rejects(ingest(shelter,b), /Device atau lokasi/);
    await assert.rejects(ingest(room,{...b,message_id:a.message_id}), /Message ID conflict/);
    await assert.rejects(ingest(shelter,{...a,temperature:31}), /Message ID conflict/);
    for(const bad of [
      {pump_on:true,tank_ok:false}, {fan_on:false,pump_on:true}, {co2:4000},
      {humidity:'65'}, {sensor_ok:null}, {ventilation_degrees:1.5}, {setpoint:50},
      {location_id:'classroom'}, {school_id:otherSchool}, {message_id:'not-uuid'},
      {sensor_ok:false}, {temperature:null}, {firmware_version:'spoof'},
      {hvac_on:true}, {ventilation_degrees:90},
    ]) await assert.rejects(ingest(shelter,{...a,message_id:randomUUID(),...bad}), /Telemetry/);
    for(const invalid of [null,[],{},'not-json-object'])
      assert.equal((await db.query<{ok:boolean}>('select public.valid_wokwi_payload($1::jsonb) as ok',[JSON.stringify(invalid)])).rows[0].ok,false);
    assert.equal((await db.query('select * from public.wokwi_samples')).rows.length,2,'invalid submissions make no partial writes');

    await identity(op);
    assert.equal((await db.query('select * from public.wokwi_controllers')).rows.length,2);
    await assert.rejects(db.query('select * from public.device_credentials'));
    await assert.rejects(ingest(shelter,packet('shelter')),'only the authenticated server ingest boundary can write');
    await assert.rejects(db.query(`update public.wokwi_controllers set requested_setpoint=31 where device_id='${shelter}'`));
    await assert.rejects(db.query(`select public.set_wokwi_setpoint('${shelter}',40)`),/18-32/);
    await db.query(`select public.set_wokwi_setpoint('${shelter}',28.5)`);
    assert.equal((await db.query<{sp:number}>(`select (latest_payload->>'setpoint')::float as sp from public.wokwi_controllers where device_id='${shelter}'`)).rows[0].sp,26.7,'requested setpoint is not a confirmation');
    await assert.rejects(db.query(`select public.request_actuator('${fan}','MANUAL',100,60,'Test queued command')`),/Wokwi memakai kontrol otomatis/);

    await identity(outsider);
    assert.equal((await db.query('select * from public.wokwi_controllers')).rows.length,0);
    assert.equal((await db.query('select * from public.wokwi_samples')).rows.length,0);
    await assert.rejects(db.query(`select public.set_wokwi_setpoint('${shelter}',29)`),/Akses/);
    await identity(reader);
    assert.equal((await db.query('select * from public.wokwi_controllers')).rows.length,0);
    await assert.rejects(db.query(`select public.set_wokwi_setpoint('${shelter}',29)`),/Akses/);
    await db.exec(`reset role; update public.school_settings set allow_operator_setpoints=false where school_id='${school}';`);
    await identity(op);
    await assert.rejects(db.query(`select public.set_wokwi_setpoint('${shelter}',29)`),/Operator tidak diizinkan/);
    await identity(admin);
    await db.query(`select public.set_wokwi_setpoint('${shelter}',28.5)`);

    await service();
    const next = {...a,message_id:randomUUID(),setpoint:28.5,temperature:29};
    const reply = (await ingest(shelter,next)).rows[0].result;
    assert.equal(reply.setpoint,28.5);
    assert.equal((await db.query<{sp:number}>(`select temperature_setpoint as sp from public.device_controls where device_id='${fan}'`)).rows[0].sp,28.5);
    const sameMinute = String(first.server_time).slice(0,16)===String(reply.server_time).slice(0,16);
    assert.equal((await db.query('select * from public.sensor_readings')).rows.length,sameMinute ? 2 : 3,'one history reading per minute, independent of raw packet rate');
    assert.equal((await db.query('select * from public.wokwi_samples')).rows.length,3);
    await db.exec(`reset role; update public.schools set is_public=true where id='${school}'; set role anon;`);
    const pub = (await db.query<{payload:{locations:{location:{id:string};latest:{temperature:number|null}}[]}}>('select payload from public.public_monitoring')).rows[0].payload;
    assert.deepEqual(pub.locations.map(x=>x.location.id),['shelter','classroom']);
    assert.equal(pub.locations[0].latest.temperature,29,'public latest uses actual current telemetry, not the minute history');
    for(const forbidden of ['device_id','controller_id','key_hash','occupancy','pump_on','fan_on','email','firmware','latest_payload','last_seen'])
      assert.equal(JSON.stringify(pub).includes(forbidden),false,`${forbidden} stays private`);
    for(const table of ['wokwi_controllers','wokwi_samples','wokwi_actuators','device_credentials']) await assert.rejects(db.query(`select * from public.${table}`));
    await assert.rejects(ingest(shelter,a));
    await assert.rejects(db.query(`select public.set_wokwi_setpoint('${shelter}',30)`));
    await service();
    await ingest(shelter,{...a,message_id:randomUUID(),sensor_ok:false,temperature:null,humidity:null,fan_on:false,pump_on:false});
    const stopped = await db.query<{value:number}>(`select value from public.devices where id='${fan}'`);
    assert.equal(stopped.rows[0].value,0);
    await db.exec('reset role; set role anon;');
    const invalidSensor = (await db.query<{payload:{locations:{latest:{temperature:number|null}}[]}}>('select payload from public.public_monitoring')).rows[0].payload;
    assert.equal(invalidSensor.locations[0].latest.temperature,null,'failed sensor does not masquerade as an old good reading');

    await db.exec('reset role;');
    await assert.rejects(db.query(`update public.devices set kind='pump' where id='${fan}'`),/Lepaskan pemetaan/);
    await db.exec(setup);
    assert.equal((await db.query('select * from public.wokwi_controllers')).rows.length,2,'rerun does not duplicate devices');
    assert.equal((await db.query('select * from public.wokwi_samples')).rows.length,4,'rerun preserves measurements');
    assert.equal((await db.query<{sp:number}>(`select requested_setpoint as sp from public.wokwi_controllers where device_id='${shelter}'`)).rows[0].sp,28.5,'rerun preserves configuration');

    await service();
    await db.query(`update public.devices set active=false where id='${room}'`);
    await assert.rejects(ingest(room,packet('classroom')),/Device atau lokasi/);
  } finally { await db.close(); }
});

test('cloud SQL refuses an unknown existing database atomically', async () => {
  const db = new PGlite();
  try {
    await db.exec(bootstrap);
    await db.exec("create table public.existing_data(note text);insert into public.existing_data values('keep me');");
    await assert.rejects(db.exec(setup),/Schema public sudah berisi tabel/);
    await db.exec('rollback;');
    assert.deepEqual((await db.query('select * from public.existing_data')).rows,[{note:'keep me'}]);
    assert.equal((await db.query<{name:string|null}>("select to_regclass('public.schools')::text as name")).rows[0].name,null);
  } finally { await db.close(); }
});
