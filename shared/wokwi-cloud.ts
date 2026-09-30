import { z } from 'zod';
import { WOKWI_LOCATIONS, wokwiLocationSchema, wokwiTelemetrySchema, type WokwiState } from './wokwi';
import type { DashboardData, SensorReading } from '../src/lib/types';

const controllerSchema = z.object({
  device_id: z.uuid(), school_id: z.uuid(), zone_id: z.uuid(),
  location_id: wokwiLocationSchema,
  requested_setpoint: z.number().min(18).max(32),
  latest_payload: wokwiTelemetrySchema.nullable(),
  last_received_at: z.string().datetime({offset:true}).nullable(),
});
// Called only with rows read through the signed-in user's Supabase client/RLS.
export function cloudWokwiStates(rows: unknown[], schoolId: string): WokwiState[] {
  return rows.map(raw => {
    const c = controllerSchema.parse(raw);
    if (c.school_id !== schoolId || (!!c.latest_payload !== !!c.last_received_at)
      || (c.latest_payload && c.latest_payload.location_id !== c.location_id))
      throw new Error('Pemetaan controller tidak valid.');
    const latest = c.latest_payload && c.last_received_at
      ? {...c.latest_payload, received_at:c.last_received_at} : null;
    return {
      controllerId:c.device_id,
      location:{...WOKWI_LOCATIONS[c.location_id], zoneId:c.zone_id},
      enabled:true, latest, history:latest ? [latest] : [],
      requestedSetpoint:c.requested_setpoint,
    };
  }).sort((a,b) => Number(a.location.id==='classroom')-Number(b.location.id==='classroom'));
}

export function overlayCloudWokwi(data: DashboardData, states: WokwiState[]): DashboardData {
  // Minute history comes from sensor_history; append the current packet for live charts.
  // Never download all raw packets again on each dashboard refresh.
  const current: SensorReading[] = states.flatMap(state => {
    const s=state.latest;
    return s?.sensor_ok && state.controllerId ? [{
      id:s.message_id, device_id:state.controllerId, school_id:data.school.id,
      zone_id:state.location.zoneId, recorded_at:s.received_at,
      temperature:s.temperature!, humidity:s.humidity!, co2:s.co2, pm25:s.pm25,
      pcm_temperature:s.pcm_temperature, wbgt:null, surface_temperature:null, soil_moisture:null,
    }] : [];
  });
  const sensors=[...new Map([...data.sensors,...current].map(s=>[s.id,s])).values()]
    .sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at));
  return {...data,sensors,wokwi:states[0],wokwiLocations:states};
}
