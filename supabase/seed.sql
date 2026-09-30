-- Synthetic data only. Safe to re-run: fixtures are upserted, histories inserted only once.
begin;
insert into public.schools(id,slug,name,location) values('10000000-0000-4000-8000-000000000001','school01','SD Negeri Candigaron 01','Desa Candigaron, Kecamatan Sumowono, Kabupaten Semarang') on conflict(id) do update set name=excluded.name,location=excluded.location;
insert into public.zones(id,school_id,slug,name,kind,description) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','playground','Lapangan terbuka','outside','Permukaan paving dengan paparan langsung.'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','shelter','Climate Shelter','shelter','Kanopi, vegetasi, kipas DC, tempat duduk dan air minum.'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','garden','Taman resapan','garden','Irigasi menggunakan air hujan untuk nonkonsumsi.'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','classroom','Gedung kelas A','classroom','Cool roof, shading dan ventilasi silang.') on conflict(id) do nothing;
insert into public.devices(id,school_id,zone_id,slug,name,kind,value)
select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',('20000000-0000-4000-8000-'||lpad(zone::text,12,'0'))::uuid,slug,name,kind,value
from (values
(1,1,'sensor-outside','Sensor lapangan','sensor',0), (2,2,'sensor-shelter','Sensor shelter','sensor',0),
(3,3,'sensor-garden','Sensor taman','sensor',0), (4,4,'sensor-classroom','Sensor kelas A','sensor',0),
(5,2,'fan','Kipas DC shelter','fan',0), (6,2,'shade','Motorized shading','shade',0), (7,3,'irrigation','Irigasi taman','irrigation',0),
(8,2,'energy-meter','Meter energi','energy',0), (9,3,'water-tank','Tandon air hujan','water',0)
) as d(n,zone,slug,name,kind,value) on conflict(id) do nothing;
-- Seed devices remain offline until a real device sends a valid heartbeat.
insert into public.sensor_readings(school_id,zone_id,device_id,recorded_at,temperature,humidity,wbgt,surface_temperature,soil_moisture)
select d.school_id,d.zone_id,d.id,now()-interval '3 minutes'-h*interval '1 hour',
  27+greatest(0,sin((extract(hour from (now()-h*interval '1 hour') at time zone 'Asia/Jakarta')-6)*pi()/12))*case z.kind when 'outside' then 8 when 'shelter' then 3 else 5 end,
  68,case z.kind when 'outside' then 29.8 when 'shelter' then 25.4 else 27 end,
  case z.kind when 'outside' then 41 when 'shelter' then 30 else 34 end,case when z.kind='garden' then 48 end
from public.devices d join public.zones z on z.id=d.zone_id cross join generate_series(0,167) h
where d.school_id='10000000-0000-4000-8000-000000000001' and d.kind='sensor' and not exists(select 1 from public.sensor_readings where device_id=d.id);
insert into public.energy_readings(school_id,device_id,recorded_at,voltage,current,power_w,energy_kwh)
select school_id,id,now()-interval '3 minutes'-h*interval '1 hour',220,0.4,88,100+(168-h)*0.075 from public.devices cross join generate_series(0,167) h where slug='energy-meter' and school_id='10000000-0000-4000-8000-000000000001' and not exists(select 1 from public.energy_readings where device_id=devices.id);
insert into public.water_readings(school_id,device_id,recorded_at,tank_level,stored_liters,used_liters,harvested_liters)
select school_id,id,now()-interval '3 minutes'-h*interval '1 hour',72,720,1000+(168-h)*3,2000+(168-h)*4 from public.devices cross join generate_series(0,167) h where slug='water-tank' and school_id='10000000-0000-4000-8000-000000000001' and not exists(select 1 from public.water_readings where device_id=devices.id);
commit;
