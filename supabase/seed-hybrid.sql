-- Optional demo fixture extension; run AFTER both migrations and seed.sql.
-- Does not create auth credentials or mark devices online. Safe to rerun.
begin;
insert into public.school_settings(school_id) select id from public.schools on conflict(school_id) do nothing;
insert into public.devices(id,school_id,zone_id,slug,name,kind,location,firmware_version)
values
('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','hvac','HVAC kelas','hvac','Gedung kelas A',''),
('30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','pump','Pompa tandon','pump','Taman resapan',''),
('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','ventilation','Ventilasi kelas','ventilation','Gedung kelas A','')
on conflict(id) do nothing;
insert into public.device_controls(device_id,school_id) select id,school_id from public.devices where kind in ('fan','shade','irrigation','hvac','pump','ventilation') on conflict(device_id) do nothing;
-- Additional deterministic synthetic readings, separate from real measurements.
insert into public.sensor_readings(id,message_id,school_id,zone_id,device_id,recorded_at,temperature,humidity,wbgt,surface_temperature,soil_moisture,co2,pm25,thermal_comfort_index,energy_consumption,pcm_temperature)
select ('41000000-0000-4000-8000-'||lpad((h*4+n)::text,12,'0'))::uuid,('41000000-0000-4000-8000-'||lpad((h*4+n)::text,12,'0'))::uuid,d.school_id,d.zone_id,d.id,now()-interval '3 minutes'-h*interval '1 hour',
28+greatest(0,sin((extract(hour from (now()-h*interval '1 hour') at time zone 'Asia/Jakarta')-6)*pi()/12))*case n when 1 then 7 else 2 end,
68,case n when 1 then 29 else 26 end,case n when 1 then 40 else 30 end,case n when 3 then 48 end,
780+200*sin(h/2.0),18+5*sin(h/3.0),80+6*sin(h/4.0),100+(168-h)*.075,27+1.6*sin(h/6.0)
from generate_series(1,4) n cross join generate_series(0,167) h
join public.devices d on d.id=('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid and d.active
on conflict(id) do nothing;

-- Public sharing remains off until the owner deliberately enables it.
do $$declare s record;begin for s in select id from public.schools where is_public loop perform public.refresh_public_monitoring(s.id);end loop;end$$;
commit;

