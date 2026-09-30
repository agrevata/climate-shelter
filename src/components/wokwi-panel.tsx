"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { WokwiSnapshot } from "@/lib/public-types";
import { postJSON } from "./dashboard-provider";

export function WokwiActuators({ state, now, allowControl = false }: {
  state: WokwiSnapshot; now: number; allowControl?: boolean;
}) {
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const s = state.latest;
  const fresh = !!s && now - Date.parse(s.received_at) < 20000;
  const status = (on?: boolean) => !fresh ? "Menunggu data" : on ? "Menyala" : "Mati";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true);
    try {
      await postJSON("/api/wokwi/config", { location_id: state.location.id, controller_id:state.controllerId, setpoint: Number(new FormData(e.currentTarget).get("setpoint")) });
      setNotice("Target dikirim. Nilai diterapkan akan berubah setelah ESP32 mengonfirmasi.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Setpoint gagal."); }
    finally { setPending(false); }
  }
  const actuators = [["Kipas", status(s?.fan_on)], ["Pompa air", status(s?.pump_on)], ...(state.location.roomActuators ? [["HVAC", status(s?.hvac_on)], ["Ventilasi", fresh ? `${s!.ventilation_degrees}°` : "Menunggu data"]] : [])];
  return <section className="panel" style={{padding:24,marginBottom:24}} aria-label={`Pendingin otomatis ${state.location.name}`}>
    <div className="panel-heading"><div><h2>Pendingin otomatis · {state.location.name}</h2><p>{state.location.roomActuators ? "Kipas, pompa air, HVAC, dan ventilasi ruang kelas." : "Tandon → pompa air → kipas shelter."}</p></div><span className="badge neutral">AUTO</span></div>
    <div className="metrics-grid">
      {actuators.map(([label,value]) => <article className="metric-card" key={label}><div>{label}</div><strong style={{fontSize:22}}>{value}</strong></article>)}
    </div>
    <p>Tandon: <strong>{!fresh ? "Menunggu data" : s?.tank_ok ? "Air tersedia" : "Kosong — pompa dihentikan"}</strong>. {s && !s.sensor_ok && "Sensor suhu gagal; keluaran dihentikan."}</p>
    <p>Target suhu: <strong>{state.requestedSetpoint}°C</strong> · Diterapkan ESP32: <strong>{s ? `${s.setpoint}°C` : "Menunggu data"}</strong>. Menyala di atas target; mati pada target − 0,5°C.</p>
    {allowControl ? <form onSubmit={submit} style={{display:"flex",gap:12,alignItems:"end",flexWrap:"wrap"}}><label>Target suhu (°C)<input name="setpoint" type="number" min="18" max="32" step="0.1" defaultValue={state.requestedSetpoint} required /></label><button className="button primary" disabled={pending}>{pending ? "Mengirim…" : "Terapkan target"}</button></form> : <Link href="/dashboard/control">Ubah target suhu di Control Panel</Link>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
