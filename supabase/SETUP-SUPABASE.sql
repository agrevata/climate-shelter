-- CLIMATE SHELTER: jalankan seluruh file di Supabase > SQL Editor > New query.
-- Untuk project baru. Semua perubahan atomik: bila gagal, tidak ada setup parsial.
-- Jika file yang SAMA sudah berhasil dijalankan, Run ulang tidak menggandakan data.
-- Tabel lama yang tidak dikenali tidak dihapus atau ditimpa; setup akan berhenti.
-- Tidak berisi API key, password, akun demo, atau pembacaan sensor palsu.
-- Pemeriksaan akhir harus menampilkan SIAP, 1 sekolah, 2 lokasi, 2 ESP32, 6 aktuator.
begin;
select pg_advisory_xact_lock(hashtextextended('climate-shelter-cloud-v1',0));
do $setup$
declare installed_hash text;
begin
  if to_regclass('public.climate_setup_history') is not null then
    execute 'select checksum from public.climate_setup_history where version=$1' into installed_hash using 'climate-shelter-cloud-v1';
    if installed_hash='33acd304c833f1901a306056d7ea0ab60e82111c5b20cbad44527cbe57d14d8b' then return; end if;
    raise exception 'Versi setup berbeda atau tidak dikenal. Jangan hapus tabel. Kirim pesan ini untuk menyiapkan migration lanjutan.';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')
        and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e'))
    or to_regprocedure('public.has_school_role(uuid,text[])') is not null then
    raise exception 'Schema public sudah berisi tabel. Setup dibatalkan tanpa menghapus data. Kirim daftar tabel atau pesan ini agar migration disesuaikan.';
  end if;
  execute $migrations$
-- SOURCE: migrations/001_initial.sql
-- Run once in a new Supabase project. All timestamps are timestamptz (UTC).

create extension if not exists pgcrypto;
create table public.schools (
  id uuid primary key default gen_random_uuid(), slug text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  name text not null, location text not null default '', timezone text not null default 'Asia/Jakarta', created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, display_name text not null default '', created_at timestamptz not null default now()
);
create table public.school_members (
  school_id uuid not null references public.schools(id), user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','operator','viewer')), created_at timestamptz not null default now(), primary key(school_id,user_id)
);
create table public.zones (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  slug text not null check (slug ~ '^[a-z0-9-]{1,40}$'), name text not null,
  kind text not null check (kind in ('outside','shelter','garden','classroom')), description text not null default '',
  unique(id,school_id), unique(school_id,slug)
);
create table public.devices (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), zone_id uuid not null,
  slug text not null check(slug ~ '^[a-z0-9-]{1,40}$'), name text not null,
  kind text not null check(kind in ('sensor','fan','shade','irrigation','energy','water')),
  mode text not null default 'AUTO' check(mode in ('AUTO','MANUAL','EMERGENCY')),
  value integer not null default 0 check(value between 0 and 100), last_seen timestamptz, emergency_latched boolean not null default false,
  foreign key(zone_id,school_id) references public.zones(id,school_id), unique(id,school_id), unique(id,zone_id,school_id), unique(school_id,slug)
);
create table public.sensor_readings (
  id uuid primary key default gen_random_uuid(), message_id uuid not null unique default gen_random_uuid(),
  school_id uuid not null, zone_id uuid not null, device_id uuid not null,
  recorded_at timestamptz not null, received_at timestamptz not null default now(),
  temperature double precision not null check(temperature between -20 and 80), humidity double precision not null check(humidity between 0 and 100),
  wbgt double precision not null check(wbgt between -20 and 65), surface_temperature double precision not null check(surface_temperature between -30 and 120),
  soil_moisture double precision check(soil_moisture between 0 and 100),
  foreign key(device_id,zone_id,school_id) references public.devices(id,zone_id,school_id)
);
create table public.energy_readings (
  id uuid primary key default gen_random_uuid(), message_id uuid not null unique default gen_random_uuid(), school_id uuid not null, device_id uuid not null,
  recorded_at timestamptz not null, received_at timestamptz not null default now(),
  voltage double precision not null check(voltage between 0 and 500), current double precision not null check(current between 0 and 100),
  power_w double precision not null check(power_w between 0 and 30000), energy_kwh double precision not null check(energy_kwh between 0 and 1e9),
  foreign key(device_id,school_id) references public.devices(id,school_id)
);
create table public.water_readings (
  id uuid primary key default gen_random_uuid(), message_id uuid not null unique default gen_random_uuid(), school_id uuid not null, device_id uuid not null,
  recorded_at timestamptz not null, received_at timestamptz not null default now(),
  tank_level double precision not null check(tank_level between 0 and 100), stored_liters double precision not null check(stored_liters between 0 and 100000),
  used_liters double precision not null check(used_liters between 0 and 1e9), harvested_liters double precision not null check(harvested_liters between 0 and 1e9),
  foreign key(device_id,school_id) references public.devices(id,school_id)
);
create table public.actuator_commands (
  id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
  school_id uuid not null, device_id uuid not null, requested_by uuid not null references auth.users(id),
  mode text not null check(mode in ('AUTO','MANUAL','EMERGENCY')), value integer not null check(value between 0 and 100),
  duration_seconds integer not null check(duration_seconds between 5 and 300), reason text not null check(length(reason) between 5 and 200 and reason !~ '[<>[:cntrl:]]'),
  status text not null default 'pending' check(status in ('pending','published','acknowledged','failed','expired')),
  attempts integer not null default 0, published_at timestamptz, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 seconds',
  foreign key(device_id,school_id) references public.devices(id,school_id), unique(id,school_id)
);
create table public.actuator_logs (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, device_id uuid not null, command_id uuid not null,
  event text not null, detail text not null, created_at timestamptz not null default now(),
  foreign key(device_id,school_id) references public.devices(id,school_id), foreign key(command_id,school_id) references public.actuator_commands(id,school_id)
);
create table public.alerts (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), zone_id uuid,
  severity text not null check(severity in ('warning','danger','info')), category text not null default 'system',
  title text not null, message text not null, created_at timestamptz not null default now(), acknowledged_at timestamptz, acknowledged_by uuid references auth.users(id),
  foreign key(zone_id,school_id) references public.zones(id,school_id)
);
create index sensor_school_time on public.sensor_readings(school_id,recorded_at desc);
create index sensor_zone_time on public.sensor_readings(zone_id,recorded_at desc);
create index energy_school_time on public.energy_readings(school_id,recorded_at desc);
create index water_school_time on public.water_readings(school_id,recorded_at desc);
create index commands_queue on public.actuator_commands(status,expires_at);
create index commands_user_time on public.actuator_commands(requested_by,created_at desc);
create index alerts_school_time on public.alerts(school_id,created_at desc);
create index logs_school_time on public.actuator_logs(school_id,created_at desc);

create function public.has_school_role(p_school uuid, p_roles text[] default array['admin','operator','viewer']) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.school_members where school_id=p_school and user_id=auth.uid() and role=any(p_roles));
$$;
revoke all on function public.has_school_role(uuid,text[]) from public;
grant execute on function public.has_school_role(uuid,text[]) to authenticated;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.school_members enable row level security;
create policy read_own_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy read_memberships on public.school_members for select to authenticated using(user_id=auth.uid() or public.has_school_role(school_id,array['admin']));
create policy read_school on public.schools for select to authenticated using(public.has_school_role(id));
do $$ declare t text; begin
  foreach t in array array['zones','devices','sensor_readings','energy_readings','water_readings','actuator_commands','actuator_logs','alerts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy school_read on public.%I for select to authenticated using(public.has_school_role(school_id))',t);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
grant select on public.schools, public.profiles, public.school_members, public.zones, public.devices, public.sensor_readings, public.energy_readings, public.water_readings, public.actuator_commands, public.actuator_logs, public.alerts to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

-- Single write boundary. Direct table inserts are denied, even with a valid anon key and user JWT.
create function public.request_actuator(p_device uuid,p_mode text,p_value integer,p_duration integer,p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d public.devices; cid uuid; r text; begin
  select * into d from public.devices where id=p_device for update;
  if not found or not public.has_school_role(d.school_id,array['admin','operator']) then raise exception 'Akses kontrol ditolak' using errcode='42501'; end if;
  select role into r from public.school_members where school_id=d.school_id and user_id=auth.uid();
  -- Serialize a user's requests across devices, so concurrent requests cannot bypass the limit.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.actuator_commands where requested_by=auth.uid() and created_at>now()-interval '1 minute') >= 10 then raise exception 'Batas 10 perintah per menit tercapai' using errcode='P0001'; end if;
  if d.kind not in ('fan','shade','irrigation') then raise exception 'Perangkat bukan aktuator'; end if;
  if d.last_seen is null or d.last_seen < now()-interval '2 minutes' then raise exception 'Perangkat offline; periksa kontrol fisik'; end if;
  if p_mode not in ('AUTO','MANUAL','EMERGENCY') or p_value is null or p_value not between 0 and 100 or p_duration is null or p_duration not between 5 and 300 or p_reason is null or length(trim(p_reason)) not between 5 and 200 or p_reason ~ '[<>[:cntrl:]]' then raise exception 'Payload tidak valid'; end if;
  if p_mode<>'MANUAL' and p_value<>0 then raise exception 'Mode ini harus bernilai 0'; end if;
  if d.kind='irrigation' and p_value not in (0,100) then raise exception 'Irigasi hanya 0 atau 100'; end if;
  if p_mode<>'EMERGENCY' and r<>'admin' and (d.emergency_latched or d.mode='EMERGENCY') then raise exception 'Hanya admin boleh melepas emergency'; end if;
  if p_mode='MANUAL' and d.kind='irrigation' and p_value>0 and not coalesce((select tank_level>15 and recorded_at>now()-interval '2 minutes' from public.water_readings where school_id=d.school_id order by recorded_at desc limit 1),false) then raise exception 'Air rendah atau data tandon kedaluwarsa'; end if;
  if p_mode<>'EMERGENCY' and exists(select 1 from public.actuator_commands where device_id=d.id and status in ('pending','published') and expires_at>now()) then raise exception 'Tunggu konfirmasi perintah sebelumnya'; end if;
  if p_mode='EMERGENCY' then
    with superseded as (update public.actuator_commands set status='expired' where device_id=d.id and status in ('pending','published') returning *)
    insert into public.actuator_logs(school_id,device_id,command_id,event,detail) select school_id,device_id,id,'superseded','Digantikan oleh emergency stop' from superseded;
    update public.devices set emergency_latched=true where id=d.id;
  end if;
  insert into public.actuator_commands(school_id,device_id,requested_by,mode,value,duration_seconds,reason) values(d.school_id,d.id,auth.uid(),p_mode,p_value,p_duration,trim(p_reason)) returning id into cid;
  insert into public.actuator_logs(school_id,device_id,command_id,event,detail) values(d.school_id,d.id,cid,'queued',trim(p_reason));
  return cid;
end $$;
revoke all on function public.request_actuator(uuid,text,integer,integer,text) from public;
grant execute on function public.request_actuator(uuid,text,integer,integer,text) to authenticated;

create function public.acknowledge_alert(p_alert uuid) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
  select school_id into sid from public.alerts where id=p_alert;
  if not public.has_school_role(sid,array['admin','operator']) then raise exception 'Akses ditolak' using errcode='42501'; end if;
  update public.alerts set acknowledged_at=now(),acknowledged_by=auth.uid() where id=p_alert and acknowledged_at is null;
end $$;
revoke all on function public.acknowledge_alert(uuid) from public;
grant execute on function public.acknowledge_alert(uuid) to authenticated;

-- The bridge uses a durable outbox: at-least-once publish with UUID deduplication on ESP32.
create function public.claim_commands(p_school uuid) returns setof public.actuator_commands language plpgsql security definer set search_path='' as $$
begin
  with expired as (update public.actuator_commands set status='expired' where school_id=p_school and status in ('pending','published') and expires_at<=now() returning *)
  insert into public.actuator_logs(school_id,device_id,command_id,event,detail) select school_id,device_id,id,'expired','Tidak ada konfirmasi sebelum batas waktu' from expired;
  return query with candidates as (
    select id from public.actuator_commands where school_id=p_school and expires_at>now() and attempts<3
      and (status='pending' or (status='published' and published_at<now()-interval '8 seconds')) order by sequence for update skip locked limit 20
  ) update public.actuator_commands c set status='published',attempts=attempts+1,published_at=now() from candidates q where c.id=q.id returning c.*;
end $$;
revoke all on function public.claim_commands(uuid) from public,anon,authenticated;
grant execute on function public.claim_commands(uuid) to service_role;

create function public.confirm_command(p_school uuid,p_device uuid,p_command uuid,p_status text,p_mode text,p_value integer,p_detail text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.actuator_commands; begin
  -- Same lock order as request_actuator: device first, command second.
  perform 1 from public.devices where id=p_device and school_id=p_school for update;
  select * into c from public.actuator_commands where id=p_command and school_id=p_school and device_id=p_device for update;
  if not found then raise exception 'Unknown command'; end if;
  if c.status not in ('pending','published') or c.expires_at<=now() then return; end if;
  if p_status not in ('acknowledged','failed') or p_mode not in ('AUTO','MANUAL','EMERGENCY') or p_value not between 0 and 100 or length(p_detail)>200 or p_detail ~ '[<>[:cntrl:]]' then raise exception 'Invalid ACK'; end if;
  if p_status='acknowledged' and (p_mode<>c.mode or (c.mode<>'AUTO' and p_value<>c.value)) then raise exception 'ACK does not match requested state'; end if;
  update public.actuator_commands set status=p_status where id=c.id;
  if p_status='acknowledged' then update public.devices set mode=p_mode,value=p_value,last_seen=now(),emergency_latched=(p_mode='EMERGENCY') where id=p_device; end if;
  insert into public.actuator_logs(school_id,device_id,command_id,event,detail) values(p_school,p_device,p_command,p_status,p_detail);
end $$;
revoke all on function public.confirm_command(uuid,uuid,uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.confirm_command(uuid,uuid,uuid,text,text,integer,text) to service_role;

-- Return one latest sample per UTC hour per zone and each zone's latest exact reading.
-- JSON aggregation avoids the Data API row cap while preserving RLS (security invoker).
create function public.dashboard_sensor_history(p_school uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.recorded_at),'[]'::jsonb) from (
    select distinct on(zone_id,date_trunc('hour',recorded_at)) * from public.sensor_readings
    where school_id=p_school and recorded_at>=now()-interval '7 days' order by zone_id,date_trunc('hour',recorded_at),recorded_at desc
  ) r;
$$;
create function public.dashboard_resource_history(p_school uuid,p_kind text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; begin
  if p_kind='energy' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.recorded_at),'[]'::jsonb) into result from (select distinct on(device_id,date_trunc('hour',recorded_at)) * from public.energy_readings where school_id=p_school and recorded_at>=now()-interval '7 days' order by device_id,date_trunc('hour',recorded_at),recorded_at desc) r;
  elsif p_kind='water' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.recorded_at),'[]'::jsonb) into result from (select distinct on(device_id,date_trunc('hour',recorded_at)) * from public.water_readings where school_id=p_school and recorded_at>=now()-interval '7 days' order by device_id,date_trunc('hour',recorded_at),recorded_at desc) r;
  else raise exception 'Unknown history type'; end if;
  return result;
end $$;
revoke all on function public.dashboard_sensor_history(uuid),public.dashboard_resource_history(uuid,text) from public;
grant execute on function public.dashboard_sensor_history(uuid),public.dashboard_resource_history(uuid,text) to authenticated;

create function public.raise_sensor_alert() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Older retained/replayed readings do not create current alerts.
  if new.recorded_at<now()-interval '2 minutes' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.zone_id::text,1));
  if new.wbgt>=28 and not exists(select 1 from public.alerts where zone_id=new.zone_id and category='heat' and created_at>now()-interval '30 minutes') then
    insert into public.alerts(school_id,zone_id,severity,category,title,message) values(new.school_id,new.zone_id,case when new.wbgt>=31 then 'danger' else 'warning' end,'heat','Paparan panas meningkat','WBGT '||round(new.wbgt::numeric,1)||'°C. Tinjau aktivitas sesuai SOP sekolah. Ambang awal perlu dikalibrasi.');
  end if;
  if new.soil_moisture<30 and not exists(select 1 from public.alerts where zone_id=new.zone_id and category='soil' and created_at>now()-interval '30 minutes') then
    insert into public.alerts(school_id,zone_id,severity,category,title,message) values(new.school_id,new.zone_id,'warning','soil','Kelembapan tanah rendah','Periksa kebutuhan penyiraman dan ketersediaan air tandon.');
  end if;
  return new;
end $$;
create trigger sensor_alert after insert on public.sensor_readings for each row execute function public.raise_sensor_alert();
create function public.raise_water_alert() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text,2));
  if new.recorded_at>now()-interval '2 minutes' and new.tank_level<=15 and not exists(select 1 from public.alerts where school_id=new.school_id and category='water' and created_at>now()-interval '30 minutes') then
    insert into public.alerts(school_id,severity,category,title,message) values(new.school_id,'warning','water','Tandon hampir kosong','Level air ≤15%. Penyiraman manual diblokir; periksa pasokan air.');
  end if;
  return new;
end $$;
create trigger water_alert after insert on public.water_readings for each row execute function public.raise_water_alert();
revoke all on function public.raise_sensor_alert(),public.raise_water_alert() from public;

do $$ declare t text; begin
  foreach t in array array['devices','sensor_readings','energy_readings','water_readings','actuator_commands','actuator_logs','alerts'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
end $$;


-- SOURCE: migrations/002_hybrid_platform.sql
-- Additive upgrade from 001. Preserve existing data and command history.

alter table public.schools add column latitude double precision check(latitude between -90 and 90), add column longitude double precision check(longitude between -180 and 180), add column is_public boolean not null default false, add column school_name text generated always as(name) stored;
alter table public.profiles add column full_name text not null default '', add column email text not null default '', add column role text not null default 'public' check(role in ('public','operator','admin','super_admin')), add column school_id uuid references public.schools(id), add column avatar_url text, add column updated_at timestamptz not null default now();
update public.profiles p set full_name=display_name,email=coalesce(u.email,'') from auth.users u where u.id=p.id;
alter table public.school_members drop constraint school_members_role_check;
update public.school_members set role='public' where role='viewer';
alter table public.school_members add constraint school_members_role_check check(role in ('public','operator','admin'));
alter table public.devices drop constraint devices_kind_check;
alter table public.devices add constraint devices_kind_check check(kind in ('sensor','fan','shade','irrigation','energy','water','hvac','pump','ventilation'));
alter table public.devices add column active boolean not null default true, add column location text not null default '', add column firmware_version text not null default '', add column created_at timestamptz not null default now(), add column updated_at timestamptz not null default now(), add column device_name text generated always as(name) stored, add column device_code text generated always as(slug) stored;
alter table public.sensor_readings alter column wbgt drop not null, alter column surface_temperature drop not null;
alter table public.sensor_readings add column co2 double precision check(co2 between 0 and 20000), add column pm25 double precision check(pm25 between 0 and 1000), add column thermal_comfort_index double precision check(thermal_comfort_index between 0 and 100), add column energy_consumption double precision check(energy_consumption between 0 and 1e9), add column pcm_temperature double precision check(pcm_temperature between -20 and 100), add column device_recorded_at timestamptz, add column created_at timestamptz not null default now();
alter table public.alerts drop constraint alerts_severity_check;
update public.alerts set severity='critical' where severity='danger';
alter table public.alerts add constraint alerts_severity_check check(severity in ('info','warning','critical'));
alter table public.alerts add column device_id uuid references public.devices(id), add column sensor_type text, add column value double precision, add column threshold double precision, add column status text not null default 'active' check(status in ('active','acknowledged','resolved')), add column resolved_at timestamptz;
alter table public.actuator_commands add column command_type text not null default 'actuator' check(command_type in ('actuator','setpoint')), add column temperature_setpoint double precision check(temperature_setpoint between 18 and 32), add column humidity_setpoint double precision check(humidity_setpoint between 40 and 80);
create table public.school_settings(school_id uuid primary key references public.schools(id),temperature_warning double precision not null default 32 check(temperature_warning between 20 and 45),co2_warning integer not null default 1000 check(co2_warning between 400 and 2000),co2_critical integer not null default 1500 check(co2_critical>co2_warning and co2_critical<=5000),pm25_warning double precision not null default 35 check(pm25_warning between 1 and 150),pm25_critical double precision not null default 75 check(pm25_critical>pm25_warning and pm25_critical<=300),pcm_melt_start double precision not null default 26 check(pcm_melt_start between 10 and 60),pcm_melt_end double precision not null default 28 check(pcm_melt_end>pcm_melt_start and pcm_melt_end<=65),allow_operator_setpoints boolean not null default true,updated_at timestamptz not null default now());
insert into public.school_settings(school_id) select id from public.schools;
create table public.device_controls(device_id uuid primary key,school_id uuid not null,fan_status boolean not null default false,hvac_status boolean not null default false,pump_status boolean not null default false,ventilation_status boolean not null default false,temperature_setpoint double precision not null default 28 check(temperature_setpoint between 18 and 32),humidity_setpoint double precision not null default 65 check(humidity_setpoint between 40 and 80),updated_by uuid references auth.users(id),updated_at timestamptz not null default now(),foreign key(device_id,school_id) references public.devices(id,school_id));
insert into public.device_controls(device_id,school_id) select id,school_id from public.devices where kind in ('fan','shade','irrigation','hvac','pump','ventilation');
create table public.activity_logs(id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),user_id uuid references auth.users(id),action text not null,device_id uuid references public.devices(id),description text not null,created_at timestamptz not null default now());
create index activity_school_time on public.activity_logs(school_id,created_at desc);
create table public.device_credentials(id uuid primary key default gen_random_uuid(),device_id uuid not null references public.devices(id),key_hash text not null check(key_hash~'^[a-f0-9]{64}$'),created_at timestamptz not null default now(),revoked_at timestamptz,window_start timestamptz not null default now(),request_count integer not null default 0,last_used_at timestamptz);
create index device_credentials_device on public.device_credentials(device_id);

create function public.is_super_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='super_admin') $$;
revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;
create or replace function public.has_school_role(p_school uuid,p_roles text[] default array['admin','operator','public']) returns boolean language sql stable security definer set search_path='' as $$ select public.is_super_admin() or exists(select 1 from public.school_members where school_id=p_school and user_id=auth.uid() and role=any(p_roles)) $$;
drop policy read_own_profile on public.profiles;
create policy read_profile on public.profiles for select to authenticated using(id=auth.uid() or public.is_super_admin() or exists(select 1 from public.school_members m where m.user_id=profiles.id and public.has_school_role(m.school_id,array['admin'])));
do $$ declare t text; begin foreach t in array array['school_settings','device_controls','activity_logs'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy school_read on public.%I for select to authenticated using(public.has_school_role(school_id))',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);end loop;end $$;
alter table public.device_credentials enable row level security;
revoke all on public.device_credentials from anon,authenticated;
grant all on public.school_settings,public.device_controls,public.activity_logs,public.device_credentials to service_role;

-- Trust no role from auth metadata. All new users start with public rights and no membership.
create function public.new_auth_profile() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,email,full_name) values(new.id,coalesce(new.email,''),'') on conflict(id) do update set email=excluded.email,updated_at=now();return new;end $$;
create trigger on_auth_user_profile after insert or update of email on auth.users for each row execute function public.new_auth_profile();
insert into public.profiles(id,email,full_name) select id,coalesce(email,''),'' from auth.users on conflict(id) do nothing;
revoke all on function public.new_auth_profile() from public;

create function public.audit_command() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.activity_logs(school_id,user_id,action,device_id,description) values(new.school_id,new.requested_by,'command.requested',new.device_id,new.command_type||' / '||new.mode||' / '||new.reason);return new;end $$;
create trigger command_activity after insert on public.actuator_commands for each row execute function public.audit_command();
revoke all on function public.audit_command() from public;

create or replace function public.request_actuator(p_device uuid,p_mode text,p_value integer,p_duration integer,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.devices;cid uuid; begin
select * into d from public.devices where id=p_device for update;
if not found or not public.has_school_role(d.school_id,array['admin','operator']) then raise exception 'Akses kontrol ditolak' using errcode='42501';end if;
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
if (select count(*) from public.actuator_commands where requested_by=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Batas 10 perintah per menit tercapai';end if;
if not d.active or d.kind not in ('fan','shade','irrigation','hvac','pump','ventilation') then raise exception 'Aktuator tidak aktif';end if;
if d.last_seen is null or d.last_seen<now()-interval '2 minutes' then raise exception 'Perangkat offline';end if;
if p_mode is null or p_mode not in ('AUTO','MANUAL','EMERGENCY') or p_value is null or p_value not between 0 and 100 or p_duration is null or p_duration not between 5 and 300 or p_reason is null or length(trim(p_reason)) not between 5 and 200 or p_reason~'[<>[:cntrl:]]' then raise exception 'Payload tidak valid';end if;
if p_mode<>'MANUAL' and p_value<>0 then raise exception 'Mode ini harus bernilai 0';end if;
if d.kind in ('irrigation','hvac','pump','ventilation') and p_value not in (0,100) then raise exception 'Perangkat hanya mendukung ON/OFF';end if;
if p_mode<>'EMERGENCY' and not public.has_school_role(d.school_id,array['admin']) and (d.emergency_latched or d.mode='EMERGENCY') then raise exception 'Hanya admin boleh melepas emergency';end if;
if p_mode='MANUAL' and d.kind in ('irrigation','pump') and p_value>0 and not coalesce((select tank_level>15 and recorded_at>now()-interval '2 minutes' from public.water_readings where school_id=d.school_id order by recorded_at desc limit 1),false) then raise exception 'Air rendah atau data tandon kedaluwarsa';end if;
if p_mode<>'EMERGENCY' and exists(select 1 from public.actuator_commands where device_id=d.id and status in ('pending','published') and expires_at>now()) then raise exception 'Tunggu perintah sebelumnya';end if;
if p_mode='EMERGENCY' then
with superseded as(update public.actuator_commands set status='expired' where device_id=d.id and status in ('pending','published') returning *) insert into public.actuator_logs(school_id,device_id,command_id,event,detail) select school_id,device_id,id,'superseded','Digantikan emergency stop' from superseded;
update public.devices set emergency_latched=true where id=d.id;
end if;
insert into public.actuator_commands(school_id,device_id,requested_by,mode,value,duration_seconds,reason) values(d.school_id,d.id,auth.uid(),p_mode,p_value,p_duration,trim(p_reason)) returning id into cid;
insert into public.actuator_logs(school_id,device_id,command_id,event,detail) values(d.school_id,d.id,cid,'queued',trim(p_reason));return cid;
end $$;

create function public.request_setpoints(p_device uuid,p_temperature double precision,p_humidity double precision,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.devices;cid uuid; begin
select * into d from public.devices where id=p_device for update;
if not found or not public.has_school_role(d.school_id,array['operator','admin']) then raise exception 'Akses ditolak' using errcode='42501';end if;
if not public.has_school_role(d.school_id,array['admin']) and not coalesce((select allow_operator_setpoints from public.school_settings where school_id=d.school_id),false) then raise exception 'Operator tidak diizinkan mengubah setpoint';end if;
if not d.active or d.kind not in ('hvac','fan','ventilation') or d.last_seen is null or d.last_seen<now()-interval '2 minutes' or d.emergency_latched then raise exception 'Perangkat tidak siap untuk setpoint';end if;
if p_temperature is null or p_temperature not between 18 and 32 or p_humidity is null or p_humidity not between 40 and 80 or p_reason is null or length(trim(p_reason)) not between 5 and 100 or p_reason~'[<>[:cntrl:]]' then raise exception 'Setpoint tidak valid';end if;
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
if (select count(*) from public.actuator_commands where requested_by=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Batas 10 perintah per menit tercapai';end if;
if exists(select 1 from public.actuator_commands where device_id=d.id and status in ('pending','published') and expires_at>now()) then raise exception 'Tunggu perintah sebelumnya';end if;
insert into public.actuator_commands(school_id,device_id,requested_by,mode,value,duration_seconds,reason,command_type,temperature_setpoint,humidity_setpoint) values(d.school_id,d.id,auth.uid(),d.mode,d.value,60,p_reason,'setpoint',p_temperature,p_humidity) returning id into cid;return cid;
end $$;
revoke all on function public.request_setpoints(uuid,double precision,double precision,text) from public;
grant execute on function public.request_setpoints(uuid,double precision,double precision,text) to authenticated;

-- Only an acknowledged command updates confirmed setpoints.
create function public.apply_confirmed_control() returns trigger language plpgsql security definer set search_path='' as $$ begin
if new.status='acknowledged' and old.status<>new.status then
insert into public.device_controls(device_id,school_id,updated_by) values(new.device_id,new.school_id,new.requested_by) on conflict(device_id) do nothing;
if new.command_type='setpoint' then update public.device_controls set temperature_setpoint=new.temperature_setpoint,humidity_setpoint=new.humidity_setpoint,updated_by=new.requested_by,updated_at=now() where device_id=new.device_id;end if;
insert into public.activity_logs(school_id,user_id,device_id,action,description) values(new.school_id,new.requested_by,new.device_id,'command.acknowledged',new.command_type||' dikonfirmasi oleh perangkat');
end if;return new;end $$;
create trigger confirmed_control after update of status on public.actuator_commands for each row execute function public.apply_confirmed_control();
create function public.sync_control_state() returns trigger language plpgsql security definer set search_path='' as $$ begin
update public.device_controls set fan_status=(new.kind='fan' and new.value>0),hvac_status=(new.kind='hvac' and new.value>0),pump_status=(new.kind in ('pump','irrigation') and new.value>0),ventilation_status=(new.kind='ventilation' and new.value>0),updated_at=now() where device_id=new.id;return new;end $$;
create trigger sync_control after update of value on public.devices for each row execute function public.sync_control_state();
revoke all on function public.apply_confirmed_control(),public.sync_control_state() from public;

create function public.admin_device(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p->>'schoolId')::uuid;did uuid:=coalesce((p->>'id')::uuid,gen_random_uuid()); begin
if not public.has_school_role(sid,array['admin']) then raise exception 'Admin diperlukan' using errcode='42501';end if;
if length(p->>'name') not between 2 and 100 or (p->>'slug')!~'^[a-z0-9-]{1,40}$' or length(p->>'location') not between 2 and 100 or length(p->>'firmwareVersion')>40 then raise exception 'Perangkat tidak valid';end if;
if p ? 'id' and not exists(select 1 from public.devices where id=did and school_id=sid) then raise exception 'Perangkat tidak ditemukan' using errcode='42501';end if;
insert into public.devices(id,school_id,zone_id,name,slug,kind,location,firmware_version,active) values(did,sid,(p->>'zoneId')::uuid,p->>'name',p->>'slug',p->>'kind',p->>'location',p->>'firmwareVersion',(p->>'active')::boolean)
on conflict(id) do update set zone_id=excluded.zone_id,name=excluded.name,slug=excluded.slug,kind=excluded.kind,location=excluded.location,firmware_version=excluded.firmware_version,active=excluded.active,updated_at=now();
if not (p->>'active')::boolean then update public.device_credentials set revoked_at=now() where device_id=did and revoked_at is null;update public.actuator_commands set status='expired' where device_id=did and status in ('pending','published');end if;
if p->>'kind' in ('fan','shade','irrigation','hvac','pump','ventilation') then insert into public.device_controls(device_id,school_id) values(did,sid) on conflict(device_id) do nothing;end if;
insert into public.activity_logs(school_id,user_id,device_id,action,description) values(sid,auth.uid(),did,'device.saved',p->>'name');return did;
end $$;
create function public.admin_settings(p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p->>'schoolId')::uuid;begin
if not public.has_school_role(sid,array['admin']) then raise exception 'Admin diperlukan' using errcode='42501';end if;
insert into public.school_settings(school_id,temperature_warning,co2_warning,co2_critical,pm25_warning,pm25_critical,pcm_melt_start,pcm_melt_end,allow_operator_setpoints) values(sid,(p->>'temperatureWarning')::double precision,(p->>'co2Warning')::integer,(p->>'co2Critical')::integer,(p->>'pm25Warning')::double precision,(p->>'pm25Critical')::double precision,(p->>'pcmMeltStart')::double precision,(p->>'pcmMeltEnd')::double precision,(p->>'allowOperatorSetpoints')::boolean)
on conflict(school_id) do update set temperature_warning=excluded.temperature_warning,co2_warning=excluded.co2_warning,co2_critical=excluded.co2_critical,pm25_warning=excluded.pm25_warning,pm25_critical=excluded.pm25_critical,pcm_melt_start=excluded.pcm_melt_start,pcm_melt_end=excluded.pcm_melt_end,allow_operator_setpoints=excluded.allow_operator_setpoints,updated_at=now();
insert into public.activity_logs(school_id,user_id,action,description) values(sid,auth.uid(),'settings.updated','Threshold dan izin setpoint diperbarui');end $$;
create function public.admin_school(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid:=coalesce((p->>'id')::uuid,gen_random_uuid());begin
if not public.is_super_admin() then raise exception 'Super admin diperlukan' using errcode='42501';end if;
if length(p->>'name') not between 2 and 100 or (p->>'slug')!~'^[a-z0-9-]{1,40}$' or length(p->>'location') not between 2 and 100 then raise exception 'Data sekolah tidak valid';end if;
insert into public.schools(id,name,slug,location,latitude,longitude,is_public) values(sid,p->>'name',p->>'slug',p->>'location',(p->>'latitude')::double precision,(p->>'longitude')::double precision,(p->>'isPublic')::boolean)
on conflict(id) do update set name=excluded.name,slug=excluded.slug,location=excluded.location,latitude=excluded.latitude,longitude=excluded.longitude,is_public=excluded.is_public;
insert into public.school_settings(school_id) values(sid) on conflict(school_id) do nothing;
insert into public.zones(school_id,slug,name,kind,description) values(sid,'shelter','Climate Shelter','shelter','Zona utama sekolah') on conflict(school_id,slug) do nothing;
insert into public.activity_logs(school_id,user_id,action,description) values(sid,auth.uid(),'school.saved',p->>'name');return sid;end $$;
create function public.admin_members(p_school uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
if not public.has_school_role(p_school,array['admin']) then raise exception 'Admin diperlukan' using errcode='42501';end if;
return coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'full_name',coalesce(p.full_name,''),'email',u.email,'role',m.role,'school_id',m.school_id,'created_at',m.created_at)) from public.school_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=u.id where m.school_id=p_school),'[]'::jsonb);end $$;
create function public.admin_member(p_school uuid,p_email text,p_role text,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid;existing text;begin
if not public.has_school_role(p_school,array['admin']) then raise exception 'Admin diperlukan' using errcode='42501';end if;
if p_role not in ('operator','admin','public') or p_action not in ('grant','revoke') then raise exception 'Aksi tidak valid';end if;
select id into uid from auth.users where lower(email)=lower(p_email);if uid is null then raise exception 'Akun belum terdaftar. Kirim undangan terlebih dahulu.';end if;
if uid=auth.uid() then raise exception 'Tidak dapat mengubah akses sendiri';end if;
select role into existing from public.school_members where school_id=p_school and user_id=uid;
if not public.is_super_admin() and (p_role='admin' or existing='admin' or exists(select 1 from public.profiles where id=uid and role='super_admin')) then raise exception 'Hanya super admin dapat mengelola admin' using errcode='42501';end if;
if p_action='revoke' then delete from public.school_members where school_id=p_school and user_id=uid;else insert into public.school_members(school_id,user_id,role) values(p_school,uid,p_role) on conflict(school_id,user_id) do update set role=excluded.role;end if;
update public.profiles set role=case when role='super_admin' then role else p_role end,school_id=coalesce(school_id,p_school),updated_at=now() where id=uid;
insert into public.activity_logs(school_id,user_id,action,description) values(p_school,auth.uid(),'membership.'||p_action,uid::text||' / '||p_role);end $$;
revoke all on function public.admin_device(jsonb),public.admin_settings(jsonb),public.admin_school(jsonb),public.admin_members(uuid),public.admin_member(uuid,text,text,text) from public;
grant execute on function public.admin_device(jsonb),public.admin_settings(jsonb),public.admin_school(jsonb),public.admin_members(uuid),public.admin_member(uuid,text,text,text) to authenticated;

create function public.issue_device_key(p_device uuid,p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.devices;kid uuid;begin
select * into d from public.devices where id=p_device for update;
if not found or not d.active or not public.has_school_role(d.school_id,array['admin']) then raise exception 'Admin diperlukan' using errcode='42501';end if;
if p_hash!~'^[a-f0-9]{64}$' then raise exception 'Hash tidak valid';end if;
update public.device_credentials set revoked_at=now() where device_id=d.id and revoked_at is null;
insert into public.device_credentials(device_id,key_hash) values(d.id,p_hash) returning id into kid;
insert into public.activity_logs(school_id,user_id,device_id,action,description) values(d.school_id,auth.uid(),d.id,'device.key_rotated','Key lama dicabut; hash key baru disimpan');return kid;end $$;
revoke all on function public.issue_device_key(uuid,text) from public;
grant execute on function public.issue_device_key(uuid,text) to authenticated;
create function public.authorize_device(p_key uuid,p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare k public.device_credentials;begin
select * into k from public.device_credentials where id=p_key and revoked_at is null and key_hash=p_hash for update;
if not found or not exists(select 1 from public.devices where id=k.device_id and active) then raise exception 'Device authentication failed' using errcode='28000';end if;
if k.window_start<now()-interval '1 minute' then k.request_count=0;k.window_start=now();end if;
if k.request_count>=120 then raise exception 'Device rate limit' using errcode='P0001';end if;
update public.device_credentials set request_count=k.request_count+1,window_start=k.window_start,last_used_at=now() where id=k.id;return k.device_id;end $$;
create function public.ingest_device_reading(p_device uuid,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.devices;rid uuid;begin
select * into d from public.devices where id=p_device and active and kind='sensor' for update;
if not found or (lower(p->>'device_id')<>lower(d.slug) and p->>'device_id'<>d.id::text) then raise exception 'Device mismatch' using errcode='28000';end if;
if exists(select 1 from public.sensor_readings where message_id=(p->>'message_id')::uuid and device_id<>d.id) then raise exception 'Message ID conflict';end if;
insert into public.sensor_readings(message_id,school_id,zone_id,device_id,recorded_at,device_recorded_at,temperature,humidity,co2,pm25,thermal_comfort_index,energy_consumption,pcm_temperature,wbgt,surface_temperature,soil_moisture)
values((p->>'message_id')::uuid,d.school_id,d.zone_id,d.id,now(),(p->>'recorded_at')::timestamptz,(p->>'temperature')::double precision,(p->>'humidity')::double precision,(p->>'co2')::double precision,(p->>'pm25')::double precision,(p->>'thermal_comfort_index')::double precision,(p->>'energy')::double precision,(p->>'pcm_temperature')::double precision,(p->>'wbgt')::double precision,(p->>'surface_temperature')::double precision,(p->>'soil_moisture')::double precision) on conflict(message_id) do nothing returning id into rid;
if rid is null then select id into rid from public.sensor_readings where message_id=(p->>'message_id')::uuid;return rid;end if;
update public.devices set last_seen=now(),firmware_version=coalesce(p->>'firmware_version',firmware_version),updated_at=now() where id=d.id;return rid;end $$;
create function public.device_command_queue(p_device uuid) returns setof public.actuator_commands language plpgsql security definer set search_path='' as $$begin
update public.devices set last_seen=now() where id=p_device and active;
update public.actuator_commands set status='expired' where device_id=p_device and status in ('pending','published') and expires_at<=now();
return query with q as(select c.id from public.actuator_commands c join public.devices d on d.id=c.device_id where c.device_id=p_device and d.active and c.expires_at>now() and c.attempts<3 and (c.status='pending' or(c.status='published' and c.published_at<now()-interval '8 seconds')) order by c.sequence for update of c skip locked limit 10)
update public.actuator_commands c set status='published',published_at=now(),attempts=attempts+1 from q where c.id=q.id returning c.*;end $$;
revoke all on function public.authorize_device(uuid,text),public.ingest_device_reading(uuid,jsonb),public.device_command_queue(uuid) from public,anon,authenticated;
grant execute on function public.authorize_device(uuid,text),public.ingest_device_reading(uuid,jsonb),public.device_command_queue(uuid) to service_role;

-- Configurable demonstration thresholds. They do not represent certified health advice.
create or replace function public.raise_sensor_alert() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.school_settings;metric text;v double precision;threshold_value double precision;sev text;begin
if new.recorded_at<now()-interval '2 minutes' then return new;end if;
select * into cfg from public.school_settings where school_id=new.school_id;
perform pg_advisory_xact_lock(hashtextextended(new.zone_id::text,1));
foreach metric in array array['temperature','co2','pm25','wbgt','soil'] loop
sev='warning';
case metric
when 'temperature' then v=new.temperature;threshold_value=coalesce(cfg.temperature_warning,32);
when 'co2' then v=new.co2;threshold_value=coalesce(cfg.co2_warning,1000);if v>=cfg.co2_critical then sev='critical';end if;
when 'pm25' then v=new.pm25;threshold_value=coalesce(cfg.pm25_warning,35);if v>=cfg.pm25_critical then sev='critical';end if;
when 'wbgt' then v=new.wbgt;threshold_value=28;if v>=31 then sev='critical';end if;
else v=100-new.soil_moisture;threshold_value=70;
end case;
if v>=threshold_value and not exists(select 1 from public.alerts where device_id=new.device_id and sensor_type=metric and severity=sev and created_at>now()-interval '30 minutes') then
insert into public.alerts(school_id,zone_id,device_id,severity,category,sensor_type,value,threshold,title,message) values(new.school_id,new.zone_id,new.device_id,sev,metric,metric,case when metric='soil' then new.soil_moisture else v end,case when metric='soil' then 30 else threshold_value end,upper(metric)||' melewati threshold','Periksa kondisi zona sesuai SOP sekolah. Threshold ini perlu dikalibrasi.');
end if;end loop;return new;end $$;
create function public.resolve_alert(p_alert uuid) returns void language plpgsql security definer set search_path='' as $$declare sid uuid;begin
select school_id into sid from public.alerts where id=p_alert;
if not public.has_school_role(sid,array['operator','admin']) then raise exception 'Akses ditolak' using errcode='42501';end if;
update public.alerts set resolved_at=now(),status='resolved',acknowledged_at=coalesce(acknowledged_at,now()),acknowledged_by=auth.uid() where id=p_alert;
insert into public.activity_logs(school_id,user_id,action,description) values(sid,auth.uid(),'alert.resolved',p_alert::text);end $$;
create or replace function public.acknowledge_alert(p_alert uuid) returns void language plpgsql security definer set search_path='' as $$declare sid uuid;begin
select school_id into sid from public.alerts where id=p_alert;
if not public.has_school_role(sid,array['operator','admin']) then raise exception 'Akses ditolak' using errcode='42501';end if;
update public.alerts set acknowledged_at=now(),acknowledged_by=auth.uid(),status='acknowledged' where id=p_alert and acknowledged_at is null;
insert into public.activity_logs(school_id,user_id,action,description) values(sid,auth.uid(),'alert.acknowledged',p_alert::text);end $$;
revoke all on function public.resolve_alert(uuid) from public;grant execute on function public.resolve_alert(uuid) to authenticated;

-- Public access uses a separately maintained, deliberately reduced projection only.
create table public.public_monitoring(school_id uuid primary key references public.schools(id),payload jsonb not null,updated_at timestamptz not null default now());
alter table public.public_monitoring enable row level security;
create function public.school_is_public(p_school uuid) returns boolean language sql stable security definer set search_path='' as $$select coalesce((select is_public from public.schools where id=p_school),false)$$;
revoke all on function public.school_is_public(uuid) from public;grant execute on function public.school_is_public(uuid) to anon,authenticated;
create policy public_projection_read on public.public_monitoring for select to anon,authenticated using(public.school_is_public(school_id));
revoke all on public.public_monitoring from anon,authenticated;grant select on public.public_monitoring to anon,authenticated;grant all on public.public_monitoring to service_role;
create function public.refresh_public_monitoring(p_school uuid) returns void language plpgsql security definer set search_path='' as $$
declare info jsonb;latest jsonb;history jsonb;dev jsonb;begin
if not coalesce((select is_public from public.schools where id=p_school),false) then delete from public.public_monitoring where school_id=p_school;return;end if;
select jsonb_build_object('id',id,'name',name,'slug',slug,'location',location) into info from public.schools where id=p_school;
select jsonb_build_object('temperature',r.temperature,'humidity',r.humidity,'co2',r.co2,'pm25',r.pm25,'thermal_comfort_index',r.thermal_comfort_index,'pcm_temperature',r.pcm_temperature,'energy_consumption',r.energy_consumption,'recorded_at',r.recorded_at) into latest from public.sensor_readings r join public.zones z on z.id=r.zone_id where r.school_id=p_school order by (z.kind='shelter') desc,r.recorded_at desc limit 1;
select coalesce(jsonb_agg(to_jsonb(h) order by recorded_at),'[]'::jsonb) into history from (select distinct on(date_trunc('hour',r.recorded_at)) r.recorded_at,r.temperature,r.humidity,r.co2,r.pm25,r.thermal_comfort_index,r.pcm_temperature,r.energy_consumption from public.sensor_readings r join public.zones z on z.id=r.zone_id where r.school_id=p_school and z.kind='shelter' and r.recorded_at>now()-interval '24 hours' order by date_trunc('hour',r.recorded_at),r.recorded_at desc) h;
select coalesce(jsonb_agg(jsonb_build_object('name',name,'kind',kind,'last_seen',last_seen,'value',value)),'[]'::jsonb) into dev from public.devices where school_id=p_school and active;
insert into public.public_monitoring(school_id,payload,updated_at) values(p_school,jsonb_build_object('school',info,'latest',latest,'history',history,'devices',dev,'pcm_range',(select jsonb_build_object('start',pcm_melt_start,'end',pcm_melt_end) from public.school_settings where school_id=p_school),'updated_at',now()),now()) on conflict(school_id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
end $$;
create function public.refresh_public_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin if tg_table_name='schools' then perform public.refresh_public_monitoring(new.id);else perform public.refresh_public_monitoring(new.school_id);end if;return new;end $$;
create trigger public_sensor after insert on public.sensor_readings for each row execute function public.refresh_public_trigger();
create trigger public_device after insert or update on public.devices for each row execute function public.refresh_public_trigger();
create trigger public_school after insert or update on public.schools for each row execute function public.refresh_public_trigger();
create trigger public_settings after insert or update on public.school_settings for each row execute function public.refresh_public_trigger();
revoke all on function public.refresh_public_monitoring(uuid),public.refresh_public_trigger() from public,anon,authenticated;grant execute on function public.refresh_public_monitoring(uuid) to service_role;

-- Configurable time windows; hourly samples for long ranges, minute samples for live/6h.
create function public.sensor_history(p_school uuid,p_hours integer default 24) returns jsonb language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(r) order by recorded_at),'[]'::jsonb) from(select distinct on(zone_id,date_trunc(case when p_hours<=6 then 'minute' else 'hour' end,recorded_at)) * from public.sensor_readings where school_id=p_school and recorded_at>=now()-make_interval(hours=>greatest(1,least(p_hours,720))) order by zone_id,date_trunc(case when p_hours<=6 then 'minute' else 'hour' end,recorded_at),recorded_at desc) r;
$$;
revoke all on function public.sensor_history(uuid,integer) from public;grant execute on function public.sensor_history(uuid,integer) to authenticated;
do $$declare t text;begin foreach t in array array['device_controls','activity_logs','school_settings','public_monitoring'] loop if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;end loop;end $$;
create or replace function public.dashboard_resource_history(p_school uuid,p_kind text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; begin
  if p_kind='energy' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.recorded_at),'[]'::jsonb) into result from (select distinct on(device_id,date_trunc('hour',recorded_at)) * from public.energy_readings where school_id=p_school and recorded_at>=now()-interval '30 days' order by device_id,date_trunc('hour',recorded_at),recorded_at desc) r;
  elsif p_kind='water' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.recorded_at),'[]'::jsonb) into result from (select distinct on(device_id,date_trunc('hour',recorded_at)) * from public.water_readings where school_id=p_school and recorded_at>=now()-interval '30 days' order by device_id,date_trunc('hour',recorded_at),recorded_at desc) r;
  else raise exception 'Unknown history type'; end if;
  return result;
end $$;


-- Extended ACK verifies setpoints before advancing confirmed state.
drop function public.confirm_command(uuid,uuid,uuid,text,text,integer,text);
create function public.confirm_command(p_school uuid,p_device uuid,p_command uuid,p_status text,p_mode text,p_value integer,p_detail text,p_temperature double precision default null,p_humidity double precision default null) returns void language plpgsql security definer set search_path='' as $$
declare c public.actuator_commands;begin
perform 1 from public.devices where id=p_device and school_id=p_school and active for update;
if not found then raise exception 'Inactive or unknown device';end if;
select * into c from public.actuator_commands where id=p_command and school_id=p_school and device_id=p_device for update;
if not found then raise exception 'Unknown command';end if;
if c.status='acknowledged' and p_status='acknowledged' then return;end if;
if c.status not in ('pending','published') or c.expires_at<=now() then raise exception 'Command expired or already completed';end if;
if p_status is null or p_status not in ('acknowledged','failed') or p_mode is null or p_mode not in ('AUTO','MANUAL','EMERGENCY') or p_value is null or p_value not between 0 and 100 or p_detail is null or length(p_detail)>200 or p_detail~'[<>[:cntrl:]]' then raise exception 'Invalid ACK';end if;
if p_status='acknowledged' and (p_mode<>c.mode or(c.mode<>'AUTO' and p_value<>c.value)) then raise exception 'ACK does not match requested state';end if;
if p_status='acknowledged' and c.command_type='setpoint' and (p_temperature is distinct from c.temperature_setpoint or p_humidity is distinct from c.humidity_setpoint) then raise exception 'ACK setpoints do not match';end if;
update public.actuator_commands set status=p_status where id=c.id;
if p_status='acknowledged' then update public.devices set mode=p_mode,value=p_value,last_seen=now(),emergency_latched=(p_mode='EMERGENCY') where id=p_device;end if;
insert into public.actuator_logs(school_id,device_id,command_id,event,detail) values(p_school,p_device,p_command,p_status,p_detail);
end $$;
revoke all on function public.confirm_command(uuid,uuid,uuid,text,text,integer,text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.confirm_command(uuid,uuid,uuid,text,text,integer,text,double precision,double precision) to service_role;
create function public.check_active_reading() returns trigger language plpgsql security definer set search_path='' as $$begin
if not exists(select 1 from public.devices where id=new.device_id and school_id=new.school_id and active) then raise exception 'Inactive device';end if;return new;end $$;
revoke all on function public.check_active_reading() from public;
create trigger active_sensor before insert on public.sensor_readings for each row execute function public.check_active_reading();
create trigger active_energy before insert on public.energy_readings for each row execute function public.check_active_reading();
create trigger active_water before insert on public.water_readings for each row execute function public.check_active_reading();



create function public.system_statistics() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
if not public.is_super_admin() then raise exception 'Super admin required' using errcode='42501';end if;
return coalesce((select jsonb_agg(jsonb_build_object('school_id',s.id,'devices',(select count(*) from public.devices d where d.school_id=s.id and d.active),'online',(select count(*) from public.devices d where d.school_id=s.id and d.active and d.last_seen>now()-interval '2 minutes'),'alerts',(select count(*) from public.alerts a where a.school_id=s.id and a.resolved_at is null),'members',(select count(*) from public.school_members m where m.school_id=s.id))) from public.schools s),'[]'::jsonb);end $$;
revoke all on function public.system_statistics() from public,anon;
grant execute on function public.system_statistics() to authenticated;


-- SOURCE: migrations/003_user_monitoring.sql
-- User/public/viewer can read environmental measurements, but not operations.

do $$ declare t text; begin
  foreach t in array array['devices','actuator_commands','actuator_logs','device_controls','activity_logs'] loop
    execute format('drop policy school_read on public.%I',t);
    execute format('create policy school_read on public.%I for select to authenticated using(public.has_school_role(school_id,array[''operator'',''admin'']))',t);
  end loop;
end $$;
drop policy school_read on public.alerts;
create policy school_read on public.alerts for select to authenticated using (
  public.has_school_role(school_id,array['operator','admin']) or
  (public.has_school_role(school_id) and sensor_type in ('temperature','humidity','co2','pm25','wbgt','thermal_comfort_index','pcm_temperature'))
);

-- Public payload is an explicit environmental projection. No device heartbeat,
-- identities, actuator state or operational logs are published.
create or replace function public.refresh_public_monitoring(p_school uuid)
returns void language plpgsql security definer set search_path='' as $$
declare info jsonb; latest jsonb; history jsonb; shelter uuid;
begin
  if not coalesce((select is_public from public.schools where id=p_school),false) then
    delete from public.public_monitoring where school_id=p_school; return;
  end if;
  select jsonb_build_object('id',id,'name',name,'slug',slug,'location',location)
    into info from public.schools where id=p_school;
  select id into shelter from public.zones where school_id=p_school and kind='shelter' order by id limit 1;
  select jsonb_build_object('temperature',temperature,'humidity',humidity,'co2',co2,'pm25',pm25,
    'thermal_comfort_index',thermal_comfort_index,'pcm_temperature',pcm_temperature,
    'energy_consumption',energy_consumption,'recorded_at',recorded_at)
    into latest from public.sensor_readings where school_id=p_school and zone_id=shelter order by recorded_at desc limit 1;
  select coalesce(jsonb_agg(to_jsonb(h) order by recorded_at),'[]'::jsonb) into history from (
    select distinct on (date_trunc(case when recorded_at>now()-interval '6 hours' then 'minute' else 'hour' end,recorded_at))
      recorded_at,temperature,humidity,co2,pm25,thermal_comfort_index,pcm_temperature,energy_consumption
    from public.sensor_readings where school_id=p_school and zone_id=shelter and recorded_at>=now()-interval '30 days'
    order by date_trunc(case when recorded_at>now()-interval '6 hours' then 'minute' else 'hour' end,recorded_at),recorded_at desc
  ) h;
  insert into public.public_monitoring(school_id,payload,updated_at) values(p_school,
    jsonb_build_object('school',info,'latest',latest,'history',history,'pcm_range',
      (select jsonb_build_object('start',pcm_melt_start,'end',pcm_melt_end) from public.school_settings where school_id=p_school),
      'updated_at',now()),now())
    on conflict(school_id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
end $$;
revoke all on function public.refresh_public_monitoring(uuid) from public,anon,authenticated;
grant execute on function public.refresh_public_monitoring(uuid) to service_role;
-- Replace previously published payloads in the same transaction.
do $$ declare s record; begin
  for s in select id from public.schools loop perform public.refresh_public_monitoring(s.id); end loop;
end $$;


-- SOURCE: migrations/004_account_school_scope.sql
-- One assigned school per account. Super admins manage schools without membership.

do $$ begin
  if exists(select 1 from public.school_members group by user_id having count(*) > 1) then
    raise exception 'Ada akun dengan lebih dari satu sekolah. Tentukan sekolah akun dan cabut keanggotaan lainnya sebelum menjalankan migration 004.';
  end if;
end $$;
alter table public.school_members add constraint school_members_one_school_per_user unique(user_id);

update public.profiles p set school_id=m.school_id, role=m.role, updated_at=now()
from public.school_members m where m.user_id=p.id and p.role<>'super_admin';

create or replace function public.admin_member(p_school uuid,p_email text,p_role text,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid; assigned_school uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Hanya super admin dapat menetapkan sekolah dan akses akun' using errcode='42501';
  end if;
  if p_role is null or p_role not in ('operator','admin','public') or p_action is null or p_action not in ('grant','revoke') then
    raise exception 'Aksi tidak valid';
  end if;
  if not exists(select 1 from public.schools where id=p_school) then raise exception 'Sekolah tidak tersedia'; end if;
  select id into uid from auth.users where lower(email)=lower(p_email) for update;
  if uid is null then raise exception 'Akun belum terdaftar. Kirim undangan terlebih dahulu.'; end if;
  if uid=auth.uid() then raise exception 'Tidak dapat mengubah akses sendiri'; end if;
  if exists(select 1 from public.profiles where id=uid and role='super_admin') then
    raise exception 'Super admin mengelola seluruh sekolah tanpa keanggotaan sekolah';
  end if;
  select school_id into assigned_school from public.school_members where user_id=uid;
  if p_action='grant' then
    if assigned_school is not null and assigned_school<>p_school then
      raise exception 'Akun sudah ditetapkan ke sekolah lain. Cabut akses sekolah lama terlebih dahulu.';
    end if;
    insert into public.school_members(school_id,user_id,role) values(p_school,uid,p_role)
      on conflict(school_id,user_id) do update set role=excluded.role;
    update public.profiles set role=p_role,school_id=p_school,updated_at=now() where id=uid;
  else
    delete from public.school_members where school_id=p_school and user_id=uid;
    if assigned_school=p_school then
      update public.profiles set role='public',school_id=null,updated_at=now() where id=uid;
    end if;
  end if;
  insert into public.activity_logs(school_id,user_id,action,description)
    values(p_school,auth.uid(),'membership.'||p_action,uid::text||' / '||p_role);
end $$;
revoke all on function public.admin_member(uuid,text,text,text) from public;
grant execute on function public.admin_member(uuid,text,text,text) to authenticated;


-- SOURCE: migrations/005_wokwi_cloud.sql
-- Durable Wokwi state for Vercel. Apply after 001-004.
-- Sensor history: at most one reading/minute/controller, retained 30 days.
-- Raw packets: latest 720/controller. No simulated measurements are seeded.

create function public.valid_wokwi_payload(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; keys text[] := array[
  'device_id','location_id','message_id','temperature','humidity','co2','pm25',
  'pcm_temperature','light_lux','occupancy','sensor_ok','tank_ok','fan_on',
  'pump_on','hvac_on','ventilation_degrees','setpoint','firmware_version'];
begin
  if jsonb_typeof(p) is distinct from 'object' or not (p ?& keys)
    or exists(select 1 from jsonb_object_keys(p) x where not (x=any(keys))) then return false; end if;
  foreach k in array array['device_id','location_id','message_id','firmware_version'] loop
    if jsonb_typeof(p->k) is distinct from 'string' then return false; end if;
  end loop;
  foreach k in array array['occupancy','sensor_ok','tank_ok','fan_on','pump_on','hvac_on'] loop
    if jsonb_typeof(p->k) is distinct from 'boolean' then return false; end if;
  end loop;
  foreach k in array array['co2','pm25','pcm_temperature','light_lux','ventilation_degrees','setpoint'] loop
    if jsonb_typeof(p->k) is distinct from 'number' then return false; end if;
  end loop;
  if p->>'firmware_version'<>'climate-wokwi-3.0'
    or p->>'message_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p->>'location_id' not in ('shelter','classroom')
    or p->>'device_id'<>(case p->>'location_id' when 'shelter' then 'climate-shelter-esp32' else 'climate-classroom-esp32' end)
    or (p->>'co2')::numeric not between 400 and 2000
    or (p->>'pm25')::numeric not between 0 and 150
    or (p->>'pcm_temperature')::numeric not between 18 and 45
    or (p->>'light_lux')::numeric not between 0 and 100000
    or (p->>'ventilation_degrees')::numeric not between 0 and 180
    or mod((p->>'ventilation_degrees')::numeric,1)<>0
    or (p->>'setpoint')::numeric not between 18 and 32 then return false; end if;
  if (p->>'sensor_ok')::boolean then
    if jsonb_typeof(p->'temperature') is distinct from 'number'
      or jsonb_typeof(p->'humidity') is distinct from 'number' then return false; end if;
    if (p->>'temperature')::numeric not between -20 and 80
      or (p->>'humidity')::numeric not between 0 and 100 then return false; end if;
  elsif p->'temperature'<>'null'::jsonb or p->'humidity'<>'null'::jsonb
    or (p->>'fan_on')::boolean or (p->>'pump_on')::boolean or (p->>'hvac_on')::boolean
    or (p->>'ventilation_degrees')::numeric<>0 then return false;
  end if;
  if (p->>'pump_on')::boolean and (not (p->>'fan_on')::boolean or not (p->>'tank_ok')::boolean or not (p->>'sensor_ok')::boolean) then return false; end if;
  if p->>'location_id'='shelter' and ((p->>'hvac_on')::boolean or (p->>'ventilation_degrees')::numeric<>0) then return false; end if;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
revoke all on function public.valid_wokwi_payload(jsonb) from public;
grant execute on function public.valid_wokwi_payload(jsonb) to authenticated,service_role;

create table public.wokwi_controllers (
  device_id uuid primary key,
  school_id uuid not null,
  zone_id uuid not null,
  location_id text not null check(location_id in ('shelter','classroom')),
  expected_alias text not null,
  requested_setpoint double precision not null default 26.7 check(requested_setpoint between 18 and 32),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  latest_payload jsonb check(latest_payload is null or public.valid_wokwi_payload(latest_payload)),
  last_received_at timestamptz,
  foreign key(device_id,zone_id,school_id) references public.devices(id,zone_id,school_id),
  unique(device_id,zone_id,school_id),
  unique(school_id,location_id),
  unique(zone_id),
  check(expected_alias=case location_id when 'shelter' then 'climate-shelter-esp32' else 'climate-classroom-esp32' end),
  check(latest_payload is null or (latest_payload->>'location_id'=location_id and latest_payload->>'device_id'=expected_alias)),
  check((latest_payload is null)=(last_received_at is null))
);
create table public.wokwi_actuators (
  device_id uuid primary key,
  controller_id uuid not null,
  school_id uuid not null,
  zone_id uuid not null,
  kind text not null check(kind in ('fan','pump','hvac','ventilation')),
  foreign key(controller_id,zone_id,school_id) references public.wokwi_controllers(device_id,zone_id,school_id),
  foreign key(device_id,zone_id,school_id) references public.devices(id,zone_id,school_id),
  unique(controller_id,kind),
  check(device_id<>controller_id)
);
create table public.wokwi_samples (
  message_id uuid primary key,
  controller_id uuid not null,
  school_id uuid not null,
  zone_id uuid not null,
  received_at timestamptz not null default now(),
  payload jsonb not null check(public.valid_wokwi_payload(payload)),
  foreign key(controller_id,zone_id,school_id) references public.wokwi_controllers(device_id,zone_id,school_id),
  check(message_id=(payload->>'message_id')::uuid)
);
create index wokwi_samples_controller_time on public.wokwi_samples(controller_id,received_at desc,message_id);
create index sensor_device_time on public.sensor_readings(device_id,recorded_at desc);

do $$ declare t text; begin
  foreach t in array array['wokwi_controllers','wokwi_actuators','wokwi_samples'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy school_operations_read on public.%I for select to authenticated using(public.has_school_role(school_id,array[''operator'',''admin'']))',t);
  end loop;
end $$;

create function public.check_wokwi_binding() returns trigger
language plpgsql security definer set search_path='' as $$
declare expected_kind text;
begin
  if tg_table_name='wokwi_controllers' then expected_kind:='sensor'; else expected_kind:=new.kind; end if;
  if not exists(select 1 from public.devices where id=new.device_id and school_id=new.school_id and zone_id=new.zone_id and kind=expected_kind) then
    raise exception 'Jenis atau lokasi perangkat Wokwi tidak cocok';
  end if;
  if tg_table_name='wokwi_controllers' then
    if not exists(select 1 from public.zones where id=new.zone_id and kind=new.location_id) then raise exception 'Jenis zona Wokwi tidak cocok'; end if;
  elsif new.kind in ('hvac','ventilation') and exists(select 1 from public.wokwi_controllers where device_id=new.controller_id and location_id='shelter') then
    raise exception 'Shelter hanya menggunakan kipas dan pompa';
  end if;
  return new;
end $$;
create trigger wokwi_controller_binding before insert or update of device_id,school_id,zone_id,location_id on public.wokwi_controllers for each row execute function public.check_wokwi_binding();
create trigger wokwi_actuator_binding before insert or update on public.wokwi_actuators for each row execute function public.check_wokwi_binding();
revoke all on function public.check_wokwi_binding() from public;

-- Managed devices cannot be silently reclassified through generic device editing.
create function public.protect_wokwi_device() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.kind,new.zone_id,new.school_id) is distinct from (old.kind,old.zone_id,old.school_id)
    and (exists(select 1 from public.wokwi_controllers where device_id=old.id) or exists(select 1 from public.wokwi_actuators where device_id=old.id)) then
    raise exception 'Lepaskan pemetaan Wokwi sebelum mengganti jenis atau zona perangkat';
  end if;
  return new;
end $$;
create trigger protect_wokwi_device before update on public.devices for each row execute function public.protect_wokwi_device();
revoke all on function public.protect_wokwi_device() from public;

-- Wokwi v3 acknowledges automatic cooling setpoints in its next telemetry packet.
-- It does not consume the MQTT command queue; never present an undelivered command as successful.
create function public.reject_wokwi_queued_command() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.wokwi_actuators where device_id=new.device_id)
    or exists(select 1 from public.wokwi_controllers where device_id=new.device_id) then
    raise exception 'Wokwi memakai kontrol otomatis. Gunakan setpoint lokasi Wokwi.';
  end if;
  return new;
end $$;
create trigger reject_wokwi_queued_command before insert on public.actuator_commands for each row execute function public.reject_wokwi_queued_command();
revoke all on function public.reject_wokwi_queued_command() from public;

create function public.set_wokwi_setpoint(p_controller uuid,p_setpoint double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.wokwi_controllers;
begin
  select * into c from public.wokwi_controllers where device_id=p_controller for update;
  if not found or not public.has_school_role(c.school_id,array['admin','operator']) then raise exception 'Akses setpoint ditolak' using errcode='42501'; end if;
  if not exists(select 1 from public.devices where id=c.device_id and active) then raise exception 'Controller tidak aktif'; end if;
  if not public.has_school_role(c.school_id,array['admin']) and not coalesce((select allow_operator_setpoints from public.school_settings where school_id=c.school_id),false) then
    raise exception 'Operator tidak diizinkan mengubah setpoint' using errcode='42501';
  end if;
  if p_setpoint is null or p_setpoint not between 18 and 32 then raise exception 'Setpoint harus 18-32 C'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,5));
  if (select count(*) from public.activity_logs where user_id=auth.uid() and action='wokwi.setpoint' and created_at>now()-interval '1 minute')>=10 then raise exception 'Batas 10 perubahan per menit tercapai'; end if;
  update public.wokwi_controllers set requested_setpoint=p_setpoint,updated_by=auth.uid(),updated_at=now() where device_id=c.device_id;
  insert into public.activity_logs(school_id,user_id,device_id,action,description)
    values(c.school_id,auth.uid(),c.device_id,'wokwi.setpoint','Target suhu '||p_setpoint||' C; menunggu laporan perangkat');
  return jsonb_build_object('ok',true,'status','pending','location_id',c.location_id,'setpoint',p_setpoint);
end $$;
revoke all on function public.set_wokwi_setpoint(uuid,double precision) from public,anon;
grant execute on function public.set_wokwi_setpoint(uuid,double precision) to authenticated;

create function public.ingest_wokwi_telemetry(p_device uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.wokwi_controllers; previous public.wokwi_samples; mid uuid; stamp timestamptz:=clock_timestamp();
begin
  if not coalesce(public.valid_wokwi_payload(p),false) then raise exception 'Telemetry Wokwi tidak valid'; end if;
  select * into c from public.wokwi_controllers where device_id=p_device for update;
  if not found or p->>'device_id'<>c.expected_alias or p->>'location_id'<>c.location_id
    or not exists(select 1 from public.devices where id=c.device_id and active and kind='sensor') then
    raise exception 'Device atau lokasi tidak cocok' using errcode='28000';
  end if;
  mid:=(p->>'message_id')::uuid;
  select * into previous from public.wokwi_samples where message_id=mid;
  if found then
    if previous.controller_id<>c.device_id or previous.payload<>p then raise exception 'Message ID conflict'; end if;
    return jsonb_build_object('ok',true,'message_id',mid,'server_time',previous.received_at,'location_id',c.location_id,'setpoint',c.requested_setpoint);
  end if;
  -- A retained minute sample still protects its identity after the raw packet expires.
  if exists(select 1 from public.sensor_readings where message_id=mid) then raise exception 'Message ID already retained'; end if;
  insert into public.wokwi_samples(message_id,controller_id,school_id,zone_id,received_at,payload)
    values(mid,c.device_id,c.school_id,c.zone_id,stamp,p);
  update public.wokwi_controllers set latest_payload=p,last_received_at=stamp where device_id=c.device_id;
  update public.devices set last_seen=stamp,firmware_version=p->>'firmware_version',updated_at=stamp where id=c.device_id;
  update public.devices d set value=case a.kind
    when 'fan' then case when (p->>'fan_on')::boolean then 100 else 0 end
    when 'pump' then case when (p->>'pump_on')::boolean then 100 else 0 end
    when 'hvac' then case when (p->>'hvac_on')::boolean then 100 else 0 end
    when 'ventilation' then case when (p->>'ventilation_degrees')::integer>0 then 100 else 0 end end,
    last_seen=stamp,mode='AUTO',updated_at=stamp,firmware_version=p->>'firmware_version'
    from public.wokwi_actuators a where a.controller_id=c.device_id and d.id=a.device_id and d.active;
  update public.device_controls dc set temperature_setpoint=(p->>'setpoint')::double precision,updated_at=stamp
    from public.wokwi_actuators a where a.controller_id=c.device_id and dc.device_id=a.device_id;
  if (p->>'sensor_ok')::boolean and not exists(select 1 from public.sensor_readings where device_id=c.device_id and recorded_at>=date_trunc('minute',stamp)) then
    insert into public.sensor_readings(message_id,school_id,zone_id,device_id,recorded_at,received_at,temperature,humidity,co2,pm25,pcm_temperature)
      values(mid,c.school_id,c.zone_id,c.device_id,stamp,stamp,(p->>'temperature')::double precision,(p->>'humidity')::double precision,
        (p->>'co2')::double precision,(p->>'pm25')::double precision,(p->>'pcm_temperature')::double precision);
    delete from public.sensor_readings where device_id=c.device_id and recorded_at<stamp-interval '30 days';
  end if;
  delete from public.wokwi_samples where controller_id=c.device_id and message_id in
    (select message_id from public.wokwi_samples where controller_id=c.device_id order by received_at desc,message_id desc offset 720);
  return jsonb_build_object('ok',true,'message_id',mid,'server_time',stamp,'location_id',c.location_id,'setpoint',c.requested_setpoint);
end $$;
revoke all on function public.ingest_wokwi_telemetry(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_wokwi_telemetry(uuid,jsonb) to service_role;

-- Only deliberate public sharing exposes this environmental projection.
-- Controller IDs, credentials, occupancy and actuator state remain private.
create or replace function public.refresh_public_monitoring(p_school uuid) returns void
language plpgsql security definer set search_path='' as $$
declare info jsonb; latest jsonb; history jsonb; locations jsonb:='[]'::jsonb; zone record; loc jsonb; pcm jsonb;
begin
  if not coalesce((select is_public from public.schools where id=p_school),false) then
    delete from public.public_monitoring where school_id=p_school; return;
  end if;
  select jsonb_build_object('id',id,'name',name,'slug',slug,'location',location) into info from public.schools where id=p_school;
  select jsonb_build_object('start',pcm_melt_start,'end',pcm_melt_end) into pcm from public.school_settings where school_id=p_school;
  for zone in select id,slug,name,kind from public.zones where school_id=p_school and kind in ('shelter','classroom') order by (kind='shelter') desc,name,id loop
    select jsonb_build_object('temperature',latest_payload->'temperature','humidity',latest_payload->'humidity',
      'co2',latest_payload->'co2','pm25',latest_payload->'pm25','pcm_temperature',latest_payload->'pcm_temperature',
      'thermal_comfort_index',null,'energy_consumption',null,'recorded_at',last_received_at)
      into latest from public.wokwi_controllers where school_id=p_school and zone_id=zone.id and latest_payload is not null;
    if not found then
      select jsonb_build_object('temperature',temperature,'humidity',humidity,'co2',co2,'pm25',pm25,
        'thermal_comfort_index',thermal_comfort_index,'pcm_temperature',pcm_temperature,'energy_consumption',energy_consumption,'recorded_at',recorded_at)
        into latest from public.sensor_readings where school_id=p_school and zone_id=zone.id order by recorded_at desc limit 1;
    end if;
    select coalesce(jsonb_agg(to_jsonb(h) order by recorded_at),'[]'::jsonb) into history from (
      select distinct on(date_trunc(case when recorded_at>now()-interval '6 hours' then 'minute' else 'hour' end,recorded_at))
        recorded_at,temperature,humidity,co2,pm25,thermal_comfort_index,pcm_temperature,energy_consumption
      from public.sensor_readings where school_id=p_school and zone_id=zone.id and recorded_at>=now()-interval '30 days'
      order by date_trunc(case when recorded_at>now()-interval '6 hours' then 'minute' else 'hour' end,recorded_at),recorded_at desc
    ) h;
    loc:=jsonb_build_object('location',jsonb_build_object('id',zone.slug,'name',zone.name),'latest',latest,'history',history,'pcm_range',pcm,'updated_at',latest->'recorded_at');
    locations:=locations||jsonb_build_array(loc);
  end loop;
  insert into public.public_monitoring(school_id,payload,updated_at) values(p_school,
    coalesce(locations->0,jsonb_build_object('latest',null,'history','[]'::jsonb,'pcm_range',pcm,'updated_at',null))
      ||jsonb_build_object('school',info,'locations',locations),now())
    on conflict(school_id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
end $$;
revoke all on function public.refresh_public_monitoring(uuid) from public,anon,authenticated;
grant execute on function public.refresh_public_monitoring(uuid) to service_role;
do $$ declare s record; begin
  for s in select id from public.schools where is_public loop perform public.refresh_public_monitoring(s.id); end loop;
end $$;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wokwi_controllers') then
    alter publication supabase_realtime add table public.wokwi_controllers;
  end if;
end $$;


-- SOURCE: provision-candigaron.sql
-- Initial real installation, NOT demo sensor data. Apply after migrations 001-005.

insert into public.schools(id,slug,name,location,is_public) values
  ('10000000-0000-4000-8000-000000000001','sd-negeri-candigaron-01','SD Negeri Candigaron 01','Candigaron',false);
insert into public.school_settings(school_id) values('10000000-0000-4000-8000-000000000001');
insert into public.zones(id,school_id,slug,name,kind,description) values
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','shelter','Shelter','shelter','Pendinginan otomatis dengan kipas dan pompa air'),
  ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','classroom','Ruang Kelas','classroom','Kipas, pompa air, HVAC, dan ventilasi');
insert into public.devices(id,school_id,zone_id,slug,name,kind,location,firmware_version) values
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','climate-shelter-esp32','ESP32 Shelter','sensor','Shelter','climate-wokwi-3.0'),
  ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','shelter-fan','Kipas Shelter','fan','Shelter','climate-wokwi-3.0'),
  ('30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','shelter-pump','Pompa air Shelter','pump','Shelter','climate-wokwi-3.0'),
  ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','climate-classroom-esp32','ESP32 Ruang Kelas','sensor','Ruang Kelas','climate-wokwi-3.0'),
  ('30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','classroom-fan','Kipas Ruang Kelas','fan','Ruang Kelas','climate-wokwi-3.0'),
  ('30000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','classroom-pump','Pompa air Ruang Kelas','pump','Ruang Kelas','climate-wokwi-3.0'),
  ('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','classroom-hvac','HVAC Ruang Kelas','hvac','Ruang Kelas','climate-wokwi-3.0'),
  ('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','classroom-ventilation','Ventilasi Ruang Kelas','ventilation','Ruang Kelas','climate-wokwi-3.0');
insert into public.device_controls(device_id,school_id,temperature_setpoint)
  select id,school_id,26.7 from public.devices where school_id='10000000-0000-4000-8000-000000000001' and kind in ('fan','pump','hvac','ventilation');
insert into public.wokwi_controllers(device_id,school_id,zone_id,location_id,expected_alias) values
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','shelter','climate-shelter-esp32'),
  ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','classroom','climate-classroom-esp32');
insert into public.wokwi_actuators(device_id,controller_id,school_id,zone_id,kind)
  select d.id,c.device_id,d.school_id,d.zone_id,d.kind from public.devices d
  join public.wokwi_controllers c on c.school_id=d.school_id and c.zone_id=d.zone_id
  where d.school_id='10000000-0000-4000-8000-000000000001' and d.kind in ('fan','pump','hvac','ventilation');

  $migrations$;
  create table public.climate_setup_history(version text primary key,checksum text not null,installed_at timestamptz not null default now());
  alter table public.climate_setup_history enable row level security;
  revoke all on public.climate_setup_history from public,anon,authenticated;
  grant select on public.climate_setup_history to service_role;
  insert into public.climate_setup_history(version,checksum) values('climate-shelter-cloud-v1','33acd304c833f1901a306056d7ea0ab60e82111c5b20cbad44527cbe57d14d8b');
end $setup$;
commit;

select 'SIAP' as status,
  (select count(*) from public.schools) as sekolah,
  (select count(*) from public.zones) as lokasi,
  (select count(*) from public.wokwi_controllers) as esp32,
  (select count(*) from public.wokwi_actuators) as aktuator,
  (select count(*) from public.sensor_readings) as pembacaan_sensor,
  (select bool_and(rowsecurity) from pg_tables where schemaname='public') as rls_aktif;
