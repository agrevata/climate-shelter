-- Durable Wokwi state for Vercel. Apply after 001-004.
-- Sensor history: at most one reading/minute/controller, retained 30 days.
-- Raw packets: latest 720/controller. No simulated measurements are seeded.
begin;

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
commit;
