-- Run once in a new Supabase project. All timestamps are timestamptz (UTC).
begin;
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
commit;
