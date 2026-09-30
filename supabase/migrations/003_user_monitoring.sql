-- User/public/viewer can read environmental measurements, but not operations.
begin;
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
commit;
