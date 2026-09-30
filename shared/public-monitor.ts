import { z } from 'zod';
import type { PublicMonitor } from '../src/lib/public-types';

const measurement=z.number().finite().nullable().catch(null);
const sample=z.object({
  temperature:measurement,humidity:measurement,co2:measurement,pm25:measurement,
  thermal_comfort_index:measurement,energy_consumption:measurement,pcm_temperature:measurement,
  recorded_at:z.string().datetime({offset:true}),
});
const location=z.object({id:z.string().max(100),name:z.string().max(200)});
const fields={
  location:location.optional(),latest:sample.nullable(),history:z.array(sample).default([]),
  updated_at:z.string().nullable().transform(v=>v??'2000-01-01T00:00:00Z'),
  pcm_range:z.object({start:z.number(),end:z.number()}).nullable().optional().transform(v=>v??undefined),
};
const publicProjection=z.object({
  school:z.object({id:z.uuid(),name:z.string(),slug:z.string(),location:z.string()}),
  ...fields,
  locations:z.array(z.object({...fields,location})).optional(),
});
// Zod strips unknown fields at EVERY level, including samples and locations.
// Never spread the database JSON into an anonymous visitor's response.
export function projectPublicMonitor(payload: unknown): PublicMonitor {
  return publicProjection.parse(payload);
}
