import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudWokwiStates,overlayCloudWokwi } from '../shared/wokwi-cloud';
import { resolveAppOrigin } from '../shared/app-origin';
import { projectPublicMonitor } from '../shared/public-monitor';
import type { DashboardData } from '../src/lib/types';
const sid='10000000-0000-4000-8000-000000000001';
test('cloud state follows the database zone and keeps pending versus confirmed setpoints separate',()=>{
  const states=cloudWokwiStates([{device_id:'30000000-0000-4000-8000-000000000002',school_id:sid,
    zone_id:'20000000-0000-4000-8000-000000000099',location_id:'shelter',requested_setpoint:29,
    latest_payload:null,last_received_at:null}],sid);
  assert.equal(states[0].location.zoneId,'20000000-0000-4000-8000-000000000099');
  assert.equal(states[0].latest,null);
  assert.equal(states[0].requestedSetpoint,29);
  const base={school:{id:sid},sensors:[]} as unknown as DashboardData;
  assert.equal(overlayCloudWokwi(base,states).sensors.length,0,'no invented measurement on new database');
  assert.throws(()=>cloudWokwiStates([{device_id:states[0].controllerId,school_id:'10000000-0000-4000-8000-000000000099',zone_id:states[0].location.zoneId,location_id:'shelter',requested_setpoint:29,latest_payload:null,last_received_at:null}],sid),/Pemetaan/);
});
test('public projection strips operational data even inside location and history objects',()=>{
  const row={temperature:30,humidity:65,co2:800,pm25:10,pcm_temperature:27,thermal_comfort_index:null,energy_consumption:null,recorded_at:new Date().toISOString(),device_id:'hidden',key_hash:'secret'};
  const loc={location:{id:'classroom',name:'Ruang Kelas',controller_id:'hidden'},latest:row,history:[row],updated_at:null,occupancy:true,wokwi:{controllerId:'hidden'}};
  const result=projectPublicMonitor({school:{id:sid,name:'School',slug:'school',location:'Village',email:'hidden'},...loc,locations:[loc],devices:['hidden']});
  for(const key of ['hidden','key_hash','device_id','wokwi','occupancy','devices','email','controller_id']) assert.ok(!JSON.stringify(result).includes(key));
  assert.equal(result.locations?.[0].location.name,'Ruang Kelas');
  assert.equal(result.updated_at,'2000-01-01T00:00:00Z');
});
test('authentication origins use configured production/preview domains, never an arbitrary request host',()=>{
  assert.equal(resolveAppOrigin({VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_PRODUCTION_URL:'climate.example.com',VERCEL_URL:'random.vercel.app'}),'https://climate.example.com');
  assert.equal(resolveAppOrigin({VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:'preview.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'production.example.com'}),'https://preview.vercel.app');
  assert.equal(resolveAppOrigin({APP_ORIGIN:'http://localhost:3000/'}),'http://localhost:3000');
  for(const value of ['http://localhost:3000','https://user:pass@example.com','https://example.com/path','javascript:alert(1)'])assert.throws(()=>resolveAppOrigin({VERCEL:'1',APP_ORIGIN:value}));
  assert.throws(()=>resolveAppOrigin({}));
});
