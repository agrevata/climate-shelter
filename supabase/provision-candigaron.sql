-- Initial real installation, NOT demo sensor data. Apply after migrations 001-005.
begin;
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
commit;
