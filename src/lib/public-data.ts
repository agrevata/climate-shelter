import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isDemo, publicSupabaseConfig } from "./env";
import { createDemo } from "./demo";
import type { PublicMonitor } from "./public-types";
import { readWokwi, wokwiEnabled } from "./wokwi-local";
import { WOKWI_LOCATIONS } from "../../shared/wokwi";
import { projectPublicMonitor } from "../../shared/public-monitor";
export async function loadPublic(): Promise<PublicMonitor[]> {
  if (isDemo) {
    const d = createDemo();
    if (wokwiEnabled()) {
      const locations = Object.values(WOKWI_LOCATIONS).map(location => {
      const state = readWokwi(location.id);
      const history = state.history.map(s => ({
        temperature: s.temperature, humidity: s.humidity, co2: s.co2, pm25: s.pm25,
        pcm_temperature: s.pcm_temperature, recorded_at: s.received_at,
        thermal_comfort_index: null, energy_consumption: null,
      }));
      return {
        location: { id: location.id, name: location.name },
        latest: history.at(-1) ?? null, history,
        updated_at: state.latest?.received_at ?? "2000-01-01T00:00:00Z",
        demo: false, wokwi: { location, latest: state.latest, requestedSetpoint: state.requestedSetpoint },
        pcm_range: { start: 26, end: 28 },
      };
      });
      return [{ school: { id: d.school.id, name: d.school.name, slug: d.school.slug, location: d.school.location }, ...locations[0], locations }];
    }
    const zone = d.zones.find((z) => z.kind === "shelter")!;
    const project = (r: (typeof d.sensors)[number]) => ({
      temperature: r.temperature,
      humidity: r.humidity,
      co2: r.co2 ?? null,
      pm25: r.pm25 ?? null,
      thermal_comfort_index: r.thermal_comfort_index ?? null,
      energy_consumption: r.energy_consumption ?? null,
      pcm_temperature: r.pcm_temperature ?? null,
      recorded_at: r.recorded_at,
    });
    const latestDemo = d.sensors.slice(-4);
    latestDemo.forEach((r) => {
      r.temperature = +(
        r.temperature +
        Math.sin(Date.now() / 240000) * 0.25
      ).toFixed(1);
      r.co2 = Math.round(780 + Math.sin(Date.now() / 330000) * 220);
      r.pm25 = +(18 + Math.sin(Date.now() / 370000) * 5).toFixed(1);
      r.pcm_temperature = +(27 + Math.sin(Date.now() / 440000) * 1.7).toFixed(
        1,
      );
    });
    const rows = d.sensors.filter((s) => s.zone_id === zone.id);
    return [
      {
        school: {
          id: d.school.id,
          name: d.school.name,
          slug: d.school.slug,
          location: d.school.location,
        },
        latest: project(rows.at(-1)!),
        history: rows.map(project),
        updated_at: d.fetchedAt,
        demo: true,
        pcm_range: { start: 26, end: 28 },
      },
    ];
  }
  const { url, key } = publicSupabaseConfig();
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db
    .from("public_monitoring")
    .select("payload")
    .limit(50);
  if (error) throw new Error("Monitoring belum tersedia.");
  return (data ?? []).map(({payload}) => projectPublicMonitor(payload));
}
