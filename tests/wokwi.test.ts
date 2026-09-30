import test from "node:test";
import assert from "node:assert/strict";
import { coolingDemand, wokwiTelemetrySchema } from "../shared/wokwi";
test("cooling uses national baseline, hysteresis and fail-safe on missing DHT",()=>{
  assert.equal(coolingDemand(26.7,false),false);
  assert.equal(coolingDemand(26.8,false),true);
  assert.equal(coolingDemand(26.5,true),true);
  assert.equal(coolingDemand(26.2,true),false);
  assert.equal(coolingDemand(null,true),false);
  assert.equal(coolingDemand(NaN,true),false);
  assert.equal(coolingDemand(29,false,30),false);
});
test("simulator telemetry enforces pump interlocks and refuses invalid/spoofed data",()=>{
  const p={device_id:"climate-classroom-esp32",location_id:"classroom",message_id:"50000000-0000-4000-8000-000000000001",temperature:29,humidity:65,co2:800,pm25:20,pcm_temperature:27,light_lux:100,occupancy:false,sensor_ok:true,tank_ok:true,fan_on:true,pump_on:true,hvac_on:false,ventilation_degrees:90,setpoint:26.7,firmware_version:"climate-wokwi-3.0"};
  assert.equal(wokwiTelemetrySchema.safeParse(p).success,true);
  for(const update of [{tank_ok:false},{fan_on:false},{temperature:null},{school_id:"spoof"},{setpoint:50},{humidity:101}]) assert.equal(wokwiTelemetrySchema.safeParse({...p,...update}).success,false);
  assert.equal(wokwiTelemetrySchema.safeParse({...p,temperature:null,humidity:null,sensor_ok:false,fan_on:false,pump_on:false,ventilation_degrees:0}).success,true);
  assert.equal(wokwiTelemetrySchema.safeParse({...p,location_id:"shelter"}).success,false);
  const shelter={...p,location_id:"shelter",device_id:"climate-shelter-esp32",ventilation_degrees:0};
  assert.equal(wokwiTelemetrySchema.safeParse(shelter).success,true);
  assert.equal(wokwiTelemetrySchema.safeParse({...shelter,hvac_on:true}).success,false);
  assert.equal(wokwiTelemetrySchema.safeParse({...shelter,ventilation_degrees:90}).success,false);
  assert.equal(wokwiTelemetrySchema.safeParse({...p,temperature:null,humidity:null,sensor_ok:false,fan_on:false,pump_on:false}).success,false);
});
