export type PublicSample = {
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  pm25: number | null;
  thermal_comfort_index: number | null;
  energy_consumption: number | null;
  pcm_temperature: number | null;
  recorded_at: string;
};
export type PublicMonitor = {
  school: { id: string; name: string; slug: string; location: string };
  latest: PublicSample | null;
  history: PublicSample[];
  updated_at: string;
  demo?: boolean;
  wokwi?: WokwiSnapshot;
  pcm_range?: { start: number; end: number };
  location?: { id: string; name: string };
  locations?: PublicLocation[];
};
export type PublicLocation = Omit<PublicMonitor, "school" | "locations"> & { location: { id: string; name: string } };
import type { WokwiState } from "../../shared/wokwi";
export type WokwiSnapshot = Pick<WokwiState, "location" | "latest" | "requestedSetpoint" | "controllerId">;
