import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudWokwiStates } from '../../shared/wokwi-cloud';
import { HttpError } from './request';
export async function loadCloudWokwi(db: SupabaseClient, schoolId: string) {
  const {data,error}=await db.from('wokwi_controllers')
    .select('device_id,school_id,zone_id,location_id,requested_setpoint,latest_payload,last_received_at')
    .eq('school_id',schoolId);
  if(error) throw new HttpError('Data Wokwi belum dapat dimuat. Periksa setup Supabase.',503);
  return cloudWokwiStates(data??[],schoolId);
}
