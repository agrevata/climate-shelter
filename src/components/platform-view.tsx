"use client";
import { useState, useRef, useEffect } from "react";
import type { ReactNode, FormEvent } from "react";
import {
  Plus,
  Settings,
  Download,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useDashboard, postJSON } from "./dashboard-provider";
import { DashboardView, DeviceControl, SensorHistory } from "./dashboard-view";
import { AirMetrics, PcmPanel, LiveCharts } from "./monitor-widgets";
import { canAdmin, canOperate } from "../../shared/platform";
import { isFresh } from "../../shared/contracts";
import { csvCell, fmt, time } from "@/lib/metrics";
import type { Device, School, View } from "@/lib/types";
import { isUserRole } from "../../shared/monitoring-access";
import { UserDashboard } from "./user-monitoring";
import { WokwiActuators } from "./wokwi-panel";
const titles: Record<string, [string, string]> = {
  live: [
    "Live Monitoring",
    "Kondisi udara, kenyamanan, dan penyimpanan termal saat ini.",
  ],
  devices: [
    "Devices",
    "Inventaris, konektivitas, dan identitas perangkat sekolah.",
  ],
  control: [
    "Device Control",
    "Kirim perintah, tunggu konfirmasi, dan telusuri hasilnya.",
  ],
  reports: [
    "Reports & Sensor History",
    "Ekspor pengukuran untuk evaluasi lingkungan sekolah.",
  ],
  activity: ["Activity Log", "Catatan perubahan dan perintah dari pengelola."],
  settings: ["Settings", "Atur ambang pemantauan dan izin setpoint sekolah."],
  users: ["User Management", "Kelola keanggotaan operator dan akses sekolah."],
  schools: [
    "School Management",
    "Kelola lokasi dan publikasi monitoring antar sekolah.",
  ],
  alerts: ["Alerts", "Peringatan lingkungan dan tindak lanjut pengelola."],
};
function Heading({ view }: { view: string }) {
  const { data } = useDashboard();
  return (
    <div className="page-heading">
      <div>
        <span className="page-kicker">CLIMATE SHELTER SCHOOL</span>
        <h1>{titles[view]?.[0]}</h1>
        <p>{titles[view]?.[1]}</p>
      </div>
      <span className="badge purple">
        {data.role.replace("_", " ")}
        {data.source === "demo" ? " · DEMO" : ""}
      </span>
    </div>
  );
}
export function PlatformView({ view }: { view: string }) {
  const { data, now } = useDashboard();
  if (isUserRole(data.role)) return <UserDashboard view={view} />;
  if (
    [
      "overview",
      "analytics",
      "heat-map",
      "energy",
      "water",
      "history",
    ].includes(view)
  )
    return <DashboardView view={view as View} />;
  return (
    <div className="page-content">
      <Heading view={view} />
      {view === "live" && (
        <>
          <AirMetrics />
          <LiveCharts />
          <PcmPanel />
          <DeviceTable />
        </>
      )}
      {view === "devices" && <DeviceManager />}
      {view === "control" && (
        <>
          {data.wokwi && <WokwiActuators key={data.wokwi.location.id} state={data.wokwi} now={now} allowControl={canOperate(data.role) && (canAdmin(data.role) || data.thresholds.allow_operator_setpoints)} />}
          <DeviceControl />
          <Setpoints />
          <CommandTable />
        </>
      )}
      {view === "alerts" && <Alerts />}
      {view === "reports" && (
        <>
          <ReportExport />
          <SensorHistory />
        </>
      )}
      {view === "activity" && <ActivityTable />}
      {view === "settings" && <SettingsForm />}
      {view === "users" &&
        (canAdmin(data.role) ? (
          <MemberManager />
        ) : (
          <div className="notice">Admin diperlukan.</div>
        ))}
      {view === "schools" &&
        (data.role === "super_admin" ? (
          <SchoolManager />
        ) : (
          <div className="notice">Super admin diperlukan.</div>
        ))}
    </div>
  );
}
function Field({
  label,
  name,
  type = "text",
  value,
  required = true,
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
        step={step}
        maxLength={type === "email" ? 254 : 100}
      />
    </label>
  );
}
function Confirmation({
  summary,
  run,
  close,
}: {
  summary: string;
  run: () => Promise<void>;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="command-dialog"
      aria-labelledby="confirm-heading"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <h2 id="confirm-heading">Konfirmasi perubahan</h2>
      <p className="confirm-summary">{summary}</p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="inline-fields">
        <button className="button" disabled={busy} onClick={close}>
          Batal
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await run();
              close();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Perubahan gagal.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Memproses…" : "Konfirmasi"}
        </button>
      </div>
    </dialog>
  );
}
function ManagedForm({
  children,
  url,
  build,
  summary,
  done,
}: {
  children: ReactNode;
  url: string;
  build: (f: FormData) => unknown;
  summary: string;
  done?: () => void;
}) {
  const { mutate } = useDashboard();
  const [pending, setPending] = useState<unknown>(),
    [message, setMessage] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setPending(build(new FormData(e.currentTarget)));
  }
  return (
    <>
      <form className="platform-form" onSubmit={submit}>
        {children}
        <button className="button primary">Tinjau & simpan</button>
        {message && (
          <p role="status" className="success-text">
            {message}
          </p>
        )}
      </form>
      {pending !== undefined && (
        <Confirmation
          summary={summary}
          close={() => setPending(undefined)}
          run={async () => {
            await mutate(url, pending);
            setMessage(
              "Tersimpan. Perintah perangkat menunggu ACK pada koneksi nyata.",
            );
            done?.();
          }}
        />
      )}
    </>
  );
}
function DeviceTable() {
  const { data, now } = useDashboard();
  const latest = new Map(data.sensors.map((r) => [r.device_id, r]));
  return (
    <div className="panel table-scroll">
      <table>
        <thead>
          <tr>
            <th>Perangkat / kode</th>
            <th>Lokasi</th>
            <th>Jenis / firmware</th>
            <th>Sensor terbaru</th>
            <th>Status / pembaruan</th>
          </tr>
        </thead>
        <tbody>
          {data.devices.map((d) => (
            <tr key={d.id}>
              <td>
                <strong>{d.name}</strong>
                <small>{d.slug}</small>
              </td>
              <td>
                {d.location || data.zones.find((z) => z.id === d.zone_id)?.name}
              </td>
              <td>
                {d.kind}
                <small>{d.firmware_version || "Belum diketahui"}</small>
              </td>
              <td>
                {d.kind === "sensor"
                  ? fmt(latest.get(d.id)?.temperature) + " °C"
                  : d.value + "% output"}
              </td>
              <td>
                <span
                  className={
                    "badge " +
                    (d.active !== false &&
                    d.last_seen &&
                    isFresh(d.last_seen, now)
                      ? "good"
                      : "neutral")
                  }
                >
                  {d.active === false
                    ? "Nonaktif"
                    : d.last_seen && isFresh(d.last_seen, now)
                      ? "Online"
                      : "Offline"}
                </span>
                <small>
                  {d.last_seen ? time(d.last_seen, true) : "Belum terhubung"}
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.devices.length && (
        <div className="empty-state">
          Belum ada perangkat. Admin dapat mendaftarkan perangkat di sekolah
          ini.
        </div>
      )}
    </div>
  );
}
function DeviceManager() {
  const { data } = useDashboard();
  const [editing, setEditing] = useState<Device | null | undefined>(),
    [token, setToken] = useState(""),
    [connect, setConnect] = useState(""),
    [connectName, setConnectName] = useState(""),
    [error, setError] = useState(""),
    [keyFor, setKeyFor] = useState<Device | null>(null);
  return (
    <>
      <DeviceTable />
      {canAdmin(data.role) && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Pengelolaan perangkat</h2>
                <p>
                  Nonaktifkan perangkat untuk mencabut key dan menghentikan
                  antrean baru.
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => setEditing(null)}
              >
                <Plus size={16} /> Tambah perangkat
              </button>
            </div>
            <div className="device-actions">
              {data.devices.map((d) => (
                <div key={d.id}>
                  <span>{d.name}</span>
                  <button className="button" onClick={() => setEditing(d)}>
                    Edit
                  </button>
                  {d.kind!=="sensor" && d.firmware_version?.startsWith("climate-wokwi-") ? <small>Terhubung melalui ESP32 lokasi ini</small> : <button
                    className="button"
                    disabled={data.source === "demo" || d.active === false}
                    onClick={() => setKeyFor(d)}
                  >
                    Rotasi API key
                  </button>}
                </div>
              ))}
            </div>
            {data.source === "demo" && (
              <p className="muted">
                API key ESP32 tersedia setelah Supabase aktif; demo tidak
                menerima ingest perangkat.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            {token && (
              <div className="secret-reveal">
                <strong>Simpan sekarang · key hanya ditampilkan sekali</strong>
                <code>{token}</code>
                {connect && <><p>Run {connectName} di Wokwi, lalu tempel baris ini ke Serial Monitor dan tekan Enter:</p><code style={{overflowWrap:"anywhere"}}>{connect}</code></>}
                <button className="button" onClick={() => setToken("")}>
                  Saya sudah menyimpan
                </button>
              </div>
            )}
          </section>
          {editing !== undefined && (
            <section className="panel" key={editing?.id ?? "new"}>
              <div className="panel-heading">
                <h2>{editing ? "Edit" : "Tambah"} perangkat</h2>
                <button
                  className="button"
                  onClick={() => setEditing(undefined)}
                >
                  Tutup
                </button>
              </div>
              <ManagedForm
                url="/api/manage/device"
                summary="Simpan identitas dan status perangkat? Menonaktifkan perangkat akan mencabut API key."
                done={() => setEditing(undefined)}
                build={(f) => ({
                  ...(editing ? { id: editing.id } : {}),
                  schoolId: data.school.id,
                  zoneId: f.get("zone"),
                  name: f.get("name"),
                  slug: f.get("slug"),
                  kind: f.get("kind"),
                  location: f.get("location"),
                  firmwareVersion: f.get("firmware"),
                  active: f.get("active") === "on",
                })}
              >
                <Field
                  label="Nama perangkat"
                  name="name"
                  value={editing?.name}
                />
                <Field
                  label="Kode unik · huruf kecil / angka / tanda hubung"
                  name="slug"
                  value={editing?.slug}
                />
                <label>
                  Zona
                  <select name="zone" defaultValue={editing?.zone_id} required>
                    {data.zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Jenis
                  <select name="kind" defaultValue={editing?.kind ?? "sensor"}>
                    {[
                      "sensor",
                      "fan",
                      "shade",
                      "irrigation",
                      "hvac",
                      "pump",
                      "ventilation",
                      "energy",
                      "water",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Lokasi"
                  name="location"
                  value={editing?.location || data.school.location}
                />
                <Field
                  label="Versi firmware"
                  name="firmware"
                  value={editing?.firmware_version}
                  required={false}
                />
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={editing?.active !== false}
                  />{" "}
                  Perangkat aktif
                </label>
              </ManagedForm>
            </section>
          )}
          {keyFor && (
            <Confirmation
              summary={
                "Rotasi API key " + keyFor.name + "? Key lama langsung dicabut."
              }
              close={() => setKeyFor(null)}
              run={async () => {
                setError("");
                try {
                  const r = await postJSON("/api/manage/key", {
                    deviceId: keyFor.id,
                  });
                  setToken(r.token);
                  setConnect(r.connect??"");
                  setConnectName(keyFor.name);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Gagal");
                  throw e;
                }
              }}
            />
          )}
        </>
      )}
    </>
  );
}
function Setpoints() {
  const { data } = useDashboard();
  if (!canOperate(data.role) || data.wokwi) return null;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Setpoint suhu & kelembapan</h2>
          <p>Nilai terkonfirmasi berubah setelah perangkat mengirim ACK.</p>
        </div>
        <Settings size={20} />
      </div>
      {!canAdmin(data.role) && !data.thresholds.allow_operator_setpoints ? (
        <div className="notice">
          Admin menonaktifkan perubahan setpoint oleh operator.
        </div>
      ) : (
        <ManagedForm
          url="/api/manage/setpoint"
          summary="Kirim setpoint baru ke perangkat? Periksa nilai dan kesiapan aktuator."
          build={(f) => ({
            deviceId: f.get("device"),
            temperature: Number(f.get("temperature")),
            humidity: Number(f.get("humidity")),
            reason: f.get("reason"),
          })}
        >
          <label>
            Perangkat
            <select name="device" required>
              {data.devices
                .filter(
                  (d) =>
                    ["fan", "hvac", "ventilation"].includes(d.kind) &&
                    d.active !== false && !(data.wokwi && d.firmware_version?.startsWith("climate-wokwi-")),
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <Field
            label="Target suhu (18–32 °C)"
            type="number"
            name="temperature"
            min={18}
            max={32}
            step={0.5}
            value={28}
          />
          <Field
            label="Target kelembapan (40–80%)"
            type="number"
            name="humidity"
            min={40}
            max={80}
            value={65}
          />
          <Field label="Alasan perubahan (minimal 5 karakter)" name="reason" />
        </ManagedForm>
      )}
      <div className="device-actions">
        {data.controls
          .filter((c) =>
            data.devices.some(
              (d) =>
                d.id === c.device_id &&
                !(data.wokwi && d.firmware_version?.startsWith("climate-wokwi-")) &&
                ["fan", "hvac", "ventilation"].includes(d.kind),
            ),
          )
          .map((c) => (
            <div key={c.device_id}>
              <strong>
                {data.devices.find((d) => d.id === c.device_id)?.name}
              </strong>
              <span>
                {c.temperature_setpoint} °C / {c.humidity_setpoint}%
                terkonfirmasi
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}
function CommandTable() {
  const { data } = useDashboard();
  return (
    <section className="panel table-scroll">
      <div className="panel-heading">
        <h2>Hasil perintah terbaru</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Perangkat</th>
            <th>Perintah</th>
            <th>Status</th>
            <th>Alasan</th>
          </tr>
        </thead>
        <tbody>
          {data.commands.map((c) => (
            <tr key={c.id}>
              <td>{time(c.created_at, true)}</td>
              <td>
                {data.devices.find((d) => d.id === c.device_id)?.name ??
                  c.device_id}
              </td>
              <td>
                {c.command_type === "setpoint"
                  ? c.temperature_setpoint +
                    " °C / " +
                    c.humidity_setpoint +
                    "%"
                  : c.mode + " · " + c.value + "%"}
              </td>
              <td>
                <span
                  className={
                    "badge " +
                    (c.status === "acknowledged"
                      ? "good"
                      : ["failed", "expired"].includes(c.status)
                        ? "danger"
                        : "warning")
                  }
                >
                  {c.status === "acknowledged" ? "Success / ACK" : c.status}
                </span>
              </td>
              <td>{c.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.commands.length && (
        <div className="empty-state">Belum ada perintah.</div>
      )}
    </section>
  );
}
function ActivityTable() {
  const { data } = useDashboard();
  return (
    <section className="panel table-scroll">
      <table>
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Aksi</th>
            <th>Pengguna</th>
            <th>Deskripsi</th>
          </tr>
        </thead>
        <tbody>
          {data.activity.map((a) => (
            <tr key={a.id}>
              <td>{time(a.created_at, true)}</td>
              <td>{a.action}</td>
              <td>
                {a.user_id === data.user.id
                  ? data.user.name
                  : (a.user_id ?? "Sistem")}
              </td>
              <td>{a.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.activity.length && (
        <div className="empty-state">
          Aktivitas akan muncul setelah ada perubahan atau perintah.
        </div>
      )}
    </section>
  );
}
function SettingsForm() {
  const { data } = useDashboard(),
    t = data.thresholds;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Threshold sekolah</h2>
        <span className="badge purple">Konfigurasi proyek</span>
      </div>
      <p className="notice">
        Threshold CO₂, PM2.5, WBGT, dan kenyamanan harus dikalibrasi bersama tim
        sekolah. Nilai bawaan adalah contoh operasional.
      </p>
      {canAdmin(data.role) ? (
        <ManagedForm
          url="/api/manage/settings"
          summary="Simpan threshold dan izin setpoint baru untuk sekolah ini?"
          build={(f) => ({
            schoolId: data.school.id,
            temperatureWarning: +f.get("temperature")!,
            co2Warning: +f.get("co2")!,
            co2Critical: +f.get("co2critical")!,
            pm25Warning: +f.get("pm25")!,
            pm25Critical: +f.get("pm25critical")!,
            pcmMeltStart: +f.get("pcmstart")!,
            pcmMeltEnd: +f.get("pcmend")!,
            allowOperatorSetpoints: f.get("operator") === "on",
          })}
        >
          <Field
            label="Peringatan suhu (°C)"
            type="number"
            name="temperature"
            min={20}
            max={45}
            step={0.1}
            value={t.temperature_warning}
          />
          <Field
            label="Peringatan CO₂ (ppm)"
            type="number"
            name="co2"
            min={400}
            max={2000}
            value={t.co2_warning}
          />
          <Field
            label="Critical CO₂ (ppm)"
            type="number"
            name="co2critical"
            min={401}
            max={5000}
            value={t.co2_critical}
          />
          <Field
            label="Peringatan PM2.5 (µg/m³)"
            type="number"
            name="pm25"
            min={1}
            max={150}
            step={0.1}
            value={t.pm25_warning}
          />
          <Field
            label="Critical PM2.5 (µg/m³)"
            type="number"
            name="pm25critical"
            min={2}
            max={300}
            step={0.1}
            value={t.pm25_critical}
          />
          <Field
            label="Awal leleh PCM (°C)"
            type="number"
            name="pcmstart"
            min={10}
            max={60}
            step={0.1}
            value={t.pcm_melt_start}
          />
          <Field
            label="Akhir leleh PCM (°C)"
            type="number"
            name="pcmend"
            min={11}
            max={65}
            step={0.1}
            value={t.pcm_melt_end}
          />
          <label className="check-label">
            <input
              name="operator"
              type="checkbox"
              defaultChecked={t.allow_operator_setpoints}
            />{" "}
            Operator boleh mengubah setpoint
          </label>
        </ManagedForm>
      ) : (
        <div className="detail-list">
          {Object.entries(t)
            .filter(([k]) => k !== "school_id")
            .map(([k, v]) => (
              <div className="detail-row" key={k}>
                <span>{k.replaceAll("_", " ")}</span>
                <strong>{String(v)}</strong>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
function MemberManager() {
  const { data } = useDashboard();
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Akses sekolah</h2>
          <ShieldCheck size={20} />
        </div>
        {data.role === "super_admin" ? <ManagedForm
          key={data.school.id}
          url="/api/manage/member"
          summary="Perbarui akses pengguna untuk sekolah ini? Undangan pada mode Supabase akan mengirim email."
          build={(f) => ({
            schoolId: data.school.id,
            email: f.get("email"),
            role: f.get("role"),
            action: f.get("action"),
          })}
        >
          <p className="form-help">Sekolah akun: <strong>{data.school.name}</strong>. Satu akun ditetapkan ke satu sekolah. Untuk memindahkan akun, cabut akses sekolah lama terlebih dahulu.</p>
          {data.source === "demo" && <p className="notice">Mode demo: perubahan hanya untuk sesi ini, belum membuat akun login nyata.</p>}
          <Field label="Email pengguna" name="email" type="email" />
          <label>
            Peran
            <select name="role">
              <option value="operator">Operator</option>
              <option value="public">Public / baca saja</option>
              {data.role === "super_admin" && (
                <option value="admin">Admin sekolah</option>
              )}
            </select>
          </label>
          <label>
            Aksi
            <select name="action">
              <option value="grant">Beri / ubah akses akun terdaftar</option>
              <option value="invite">Undang pengguna baru melalui email</option>
              <option value="revoke">Cabut akses</option>
            </select>
          </label>
        </ManagedForm> : <p>Akses akun untuk {data.school.name} ditetapkan oleh super admin. Hubungi super admin untuk menambah, memindahkan, atau mencabut akses pengguna.</p>}
      </section>
      <section className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Peran</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.id}>
                <td>{m.full_name || "Belum diisi"}</td>
                <td>{m.email}</td>
                <td>{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.members.length && (
          <div className="empty-state">Belum ada keanggotaan tambahan.</div>
        )}
      </section>
    </>
  );
}
function SchoolManager() {
  const { data, mutate } = useDashboard();
  const [editing, setEditing] = useState<School | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [selecting, setSelecting] = useState(false);
  return (
    <>
      <div className="metrics-grid">
        <article className="metric-card">
          <span>Sekolah terdaftar</span>
          <div className="metric-value">{data.schools.length}</div>
        </article>
        <article className="metric-card">
          <span>Monitoring publik aktif</span>
          <div className="metric-value">
            {data.schools.filter((s) => s.is_public).length}
          </div>
        </article>
        <article className="metric-card">
          <span>Perangkat seluruh sekolah</span>
          <div className="metric-value">
            {(data.statistics ?? []).reduce((s, v) => s + v.devices, 0)}
          </div>
        </article>
        <article className="metric-card">
          <span>Alert aktif seluruh sekolah</span>
          <div className="metric-value">
            {(data.statistics ?? []).reduce((s, v) => s + v.alerts, 0)}
          </div>
        </article>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Lokasi sekolah</h2>
          <button className="button" onClick={() => setEditing(null)}>
            <Plus size={16} /> Sekolah baru
          </button>
        </div>
        <p>Pilih sekolah yang akan dikelola, lalu buka User Management untuk menetapkan akun operator atau admin sekolah.</p>
        {selectionError && <p className="notice" role="alert">{selectionError}</p>}
        <div className="device-actions">
          {data.schools.map((s) => (
            <div key={s.id}>
              <strong>{s.name}</strong>
              <span>{s.location}</span>
              <small>
                {data.statistics?.find((v) => v.school_id === s.id)?.online ??
                  0}{" "}
                online ·{" "}
                {data.statistics?.find((v) => v.school_id === s.id)?.members ??
                  0}{" "}
                anggota
              </small>
              <span className="badge purple">
                {s.is_public ? "Publik aktif" : "Internal"}
              </span>
              <button className="button" onClick={() => setEditing(s)}>
                Edit
              </button>
              <button className="button" disabled={selecting || data.school.id === s.id} onClick={async () => {
                setSelecting(true);
                try {
                  await mutate("/api/manage/select", { schoolId: s.id });
                  setSelectionError("");
                } catch (e) {
                  setSelectionError(e instanceof Error ? e.message : "Sekolah tidak dapat dibuka.");
                } finally { setSelecting(false); }
              }}>{data.school.id === s.id ? "Sedang dikelola" : "Kelola sekolah"}</button>
              {data.school.id === s.id && <Link href="/dashboard/users">Atur akun sekolah ini →</Link>}
            </div>
          ))}
        </div>
      </section>
      <section className="panel" key={editing?.id ?? "new-school"}>
        <div className="panel-heading">
          <h2>{editing ? "Edit" : "Tambah"} sekolah</h2>
        </div>
        <ManagedForm
          url="/api/manage/school"
          summary="Simpan sekolah dan pengaturan publikasinya? Monitoring publik membagikan ringkasan lingkungan tanpa kontrol."
          build={(f) => ({
            ...(editing ? { id: editing.id } : {}),
            name: f.get("name"),
            slug: f.get("slug"),
            location: f.get("location"),
            latitude: f.get("lat") ? +f.get("lat")! : null,
            longitude: f.get("lon") ? +f.get("lon")! : null,
            isPublic: f.get("public") === "on",
          })}
        >
          <Field label="Nama sekolah" name="name" value={editing?.name} />
          <Field label="Kode sekolah" name="slug" value={editing?.slug} />
          <Field
            label="Lokasi / alamat"
            name="location"
            value={editing?.location}
          />
          <Field
            label="Latitude (opsional)"
            name="lat"
            type="number"
            min={-90}
            max={90}
            step={0.000001}
            required={false}
            value={editing?.latitude ?? undefined}
          />
          <Field
            label="Longitude (opsional)"
            name="lon"
            type="number"
            min={-180}
            max={180}
            step={0.000001}
            required={false}
            value={editing?.longitude ?? undefined}
          />
          <label className="check-label">
            <input
              type="checkbox"
              name="public"
              defaultChecked={editing?.is_public ?? false}
            />{" "}
            Bagikan ringkasan monitoring ke publik
          </label>
        </ManagedForm>
      </section>
    </>
  );
}
function Alerts() {
  const { data, mutate } = useDashboard();
  const [level, setLevel] = useState("all"),
    [status, setStatus] = useState("active"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const rows = data.alerts.filter(
    (a) =>
      (level === "all" || a.severity === level) &&
      (status === "all" ||
        (status === "resolved" ? !!a.resolved_at : !a.resolved_at)),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Peringatan lingkungan</h2>
        <div className="inline-fields">
          <select
            aria-label="Severity alert"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="all">Semua severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select
            aria-label="Status alert"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Aktif</option>
            <option value="resolved">Resolved</option>
            <option value="all">Semua status</option>
          </select>
        </div>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="platform-alerts">
        {rows.map((a) => (
          <article key={a.id}>
            <div>
              <span
                className={
                  "badge " +
                  (["danger", "critical"].includes(a.severity)
                    ? "danger"
                    : a.severity === "warning"
                      ? "warning"
                      : "blue")
                }
              >
                {a.severity}
              </span>
              <small>{time(a.created_at, true)}</small>
              <h3>{a.title}</h3>
              <p>{a.message}</p>
              <p className="muted">
                {data.devices.find((d) => d.id === a.device_id)?.name ??
                  data.zones.find((z) => z.id === a.zone_id)?.name ??
                  "Sekolah"}
                {a.value != null
                  ? " · nilai " + fmt(a.value) + " / ambang " + fmt(a.threshold)
                  : ""}
              </p>
            </div>
            <div className="inline-fields">
              {a.resolved_at ? (
                <span className="badge good">Resolved</span>
              ) : (
                canOperate(data.role) &&
                ["acknowledge", "resolve"].map((action) => (
                  <button
                    key={action}
                    className="button"
                    disabled={
                      !!busy ||
                      (action === "acknowledge" && !!a.acknowledged_at)
                    }
                    onClick={async () => {
                      setBusy(a.id);
                      setError("");
                      try {
                        await mutate("/api/alerts", { id: a.id, action });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Gagal");
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    {action === "resolve"
                      ? "Tandai selesai"
                      : a.acknowledged_at
                        ? "Ditinjau"
                        : "Acknowledge"}
                  </button>
                ))
              )}
            </div>
          </article>
        ))}
      </div>
      {!rows.length && (
        <div className="empty-state">Tidak ada alert pada filter ini.</div>
      )}
    </section>
  );
}
function ReportExport() {
  const { data, now } = useDashboard();
  const [hours, setHours] = useState(24);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Laporan lingkungan</h2>
          <p>
            CSV berisi sensor, kualitas udara, energi kumulatif, PCM, dan waktu
            UTC. Tampilan dashboard menggunakan WIB.
          </p>
        </div>
        <Download size={20} />
      </div>
      <div className="inline-fields">
        <select
          aria-label="Periode ekspor"
          value={hours}
          onChange={(e) => setHours(+e.target.value)}
        >
          {[
            [1, "1 jam"],
            [6, "6 jam"],
            [24, "24 jam"],
            [168, "7 hari"],
            [720, "30 hari"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button
          className="button primary"
          onClick={() => {
            const keys = [
              "recorded_at",
              "zone_id",
              "device_id",
              "temperature",
              "humidity",
              "co2",
              "pm25",
              "thermal_comfort_index",
              "energy_consumption",
              "pcm_temperature",
              "wbgt",
              "surface_temperature",
              "soil_moisture",
            ] as const;
            const rows = data.sensors.filter(
              (r) => Date.parse(r.recorded_at) >= now - hours * 3600000,
            );
            const csv = [
              keys.join(","),
              ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(",")),
            ].join("\r\n");
            const url = URL.createObjectURL(
              new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "climate-shelter-" + hours + "h.csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download size={16} /> Ekspor CSV
        </button>
        <Link href="/dashboard/analytics" className="text-link">
          Buka Analytics <ArrowUpRight size={16} />
        </Link>
      </div>
      <p className="muted">
        Riwayat panjang menggunakan sampel per jam; 6 jam terakhir per menit.
        Unduh data mentah dari database untuk riset presisi.
      </p>
    </section>
  );
}
