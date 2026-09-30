-- Additive upgrade from 001. Preserve existing data and command history.
begin;
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


commit;
