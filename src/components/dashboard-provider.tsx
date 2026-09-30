"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DashboardData } from "@/lib/types";
import { browserClient } from "@/lib/supabase/browser";
import type { CommandInput } from "../../shared/contracts";
import { isUserRole } from "../../shared/monitoring-access";
export async function postJSON(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Permintaan gagal.");
  return result;
}
type Context = {
  data: DashboardData;
  now: number;
  connection: string;
  error: string;
  refresh: () => Promise<void>;
  command: (c: CommandInput) => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
  resetDemo: () => void;
  mutate: (url: string, body: unknown) => Promise<void>;
  locations: { id: string; name: string }[];
  selectedZoneId: string;
  selectLocation: (id: string) => void;
};
const Context = createContext<Context | null>(null);
export function useDashboard() {
  const c = useContext(Context);
  if (!c) throw new Error("Dashboard context missing");
  return c;
}
export function DashboardProvider({
  initial,
  children,
}: {
  initial: DashboardData;
  children: React.ReactNode;
}) {
  const [data, setData] = useState(initial),
    [now, setNow] = useState(Date.parse(initial.fetchedAt)),
    [error, setError] = useState(""),
    [connection, setConnection] = useState(
      initial.source === "demo" ? "Simulasi aktif" : "Menghubungkan",
    );
  const fetching = useRef(false);
  const [selection, setSelection] = useState<{schoolId: string; zoneId: string} | null>(null);
  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store" });
      const v = await r.json();
      if (!r.ok)
        throw new Error(
          v.error || "Sesi tidak tersedia. Silakan masuk kembali.",
        );
      setData(v);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pembaruan gagal.");
    } finally {
      fetching.current = false;
    }
  }, []);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(
      () => void refresh(),
      initial.source === "demo" ? initial.wokwi ? 3000 : 6000 : 15000,
    );
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    if (initial.source === "demo")
      return () => {
        clearInterval(clock);
        clearInterval(poll);
        window.removeEventListener("focus", focus);
      };
    const db = browserClient();
    let debounce: ReturnType<typeof setTimeout>;
    const channel = db.channel("school-" + data.school.id);
    [
      "sensor_readings",
      "devices",
      "energy_readings",
      "water_readings",
      "alerts",
      "actuator_commands",
      "actuator_logs",
      "device_controls",
      "activity_logs",
      "school_settings",
      "wokwi_controllers",
    ]
      .filter(
        (table) =>
          !isUserRole(data.role) ||
          ["sensor_readings", "alerts", "school_settings"].includes(table),
      )
      .forEach((table) =>
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: "school_id=eq." + data.school.id,
          },
          () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => void refresh(), 700);
          },
        ),
      );
    channel.subscribe((s) =>
      setConnection(
        s === "SUBSCRIBED" ? "Realtime terhubung" : "Menyambung ulang",
      ),
    );
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      clearTimeout(debounce);
      window.removeEventListener("focus", focus);
      void db.removeChannel(channel);
    };
  }, [data.school.id, data.role, initial.source, initial.wokwi, refresh]);
  async function mutate(url: string, body: unknown) {
    await postJSON(url, body);
    await refresh();
  }
  const wokwiLocations = data.wokwiLocations ?? (data.wokwi ? [data.wokwi] : []);
  const locations = wokwiLocations.length
    ? wokwiLocations.map(s => ({ id: s.location.zoneId, name: s.location.name }))
    : data.zones.map(z => ({ id: z.id, name: z.name }));
  const selectedZoneId = selection?.schoolId === data.school.id && locations.some(z => z.id === selection.zoneId)
    ? selection.zoneId
    : locations.find(z => z.id === data.zones.find(v => v.kind === "shelter")?.id)?.id ?? locations[0]?.id ?? "";
  const activeWokwi = wokwiLocations.find(s => s.location.zoneId === selectedZoneId);
  return (
    <Context.Provider
      value={{
        data: { ...data, wokwi: activeWokwi, selectedZoneId },
        locations,
        selectedZoneId,
        selectLocation: (zoneId) => {
          if (locations.some(z => z.id === zoneId)) setSelection({ schoolId: data.school.id, zoneId });
        },
        now,
        error,
        connection: activeWokwi ? !activeWokwi.latest ? "Menunggu ESP32" : now - Date.parse(activeWokwi.latest.received_at) < 20000 ? "Wokwi terhubung" : "Wokwi terputus" : connection,
        refresh,
        mutate,
        command: (c) => mutate("/api/commands", c),
        acknowledge: (id) => mutate("/api/alerts", { id }),
        resetDemo: () => {
          void mutate("/api/demo/reset", {}).catch((e) => setError(e.message));
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
