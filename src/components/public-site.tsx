"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Wind,
  Sun,
  Droplets,
  Activity,
  ShieldCheck,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { PublicMonitor } from "@/lib/public-types";
import { UserMonitoringSummary, UserMonitoringChart } from "./user-monitoring";
import { browserClient } from "@/lib/supabase/browser";
import { isDemo } from "@/lib/env";
import { BrandLogo } from "./brand-logo";
export function PublicNav() {
  return (
    <header className="public-nav">
      <Link className="brand" href="/">
        <BrandLogo />
        <span>
          Climate Shelter<small>SCHOOL MICROCLIMATE</small>
        </span>
      </Link>
      <nav aria-label="Navigasi publik">
        <Link href="/#tentang">Tentang</Link>
        <Link href="/#teknologi">Teknologi</Link>
        <Link href="/monitoring">Monitoring</Link>
      </nav>
      <Link href="/login" className="button primary">
        Login Operator <ArrowUpRight size={16} />
      </Link>
    </header>
  );
}
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <span>
        <BrandLogo small /> Climate Shelter School
      </span>
      <p>Ruang yang lebih teduh. Sekolah yang lebih tangguh.</p>
      <Link href="/monitoring">Lihat kondisi sekolah →</Link>
    </footer>
  );
}
export function Landing() {
  return (
    <div className="public-site">
      <PublicNav />
      <main>
        <section className="landing-hero">
          <div>
            <span className="public-eyebrow">
              <span /> SMART SCHOOL, COOLER FUTURE
            </span>
            <h1>
              Belajar nyaman.
              <br />
              Iklim lebih
              <br />
              <em>bersahabat.</em>
            </h1>
            <p>
              Kenali udara yang kita hirup, kelola energi dengan bijak, dan
              ciptakan ruang teduh untuk tumbuh bersama.
            </p>
            <div className="landing-actions">
              <Link href="/monitoring" className="button primary">
                Lihat monitoring <ArrowRight size={18} />
              </Link>
              <a href="#teknologi" className="text-link">
                Kenali teknologinya <ArrowUpRight size={17} />
              </a>
            </div>
            <div className="hero-proof">
              <span>
                <Activity size={16} /> Pemantauan langsung
              </span>
              <span>
                <ShieldCheck size={16} /> Akses publik terbatas
              </span>
            </div>
          </div>
          <div
            className="shelter-scene"
            role="img"
            aria-label="Ilustrasi climate shelter dengan kanopi, tanaman, panel surya, dan tandon air hujan"
          >
            <svg viewBox="0 0 600 470" aria-hidden="true">
              <defs>
                <linearGradient id="sky" x2="0" y2="1">
                  <stop stopColor="#eeebff" />
                  <stop offset="1" stopColor="#e3f5ed" />
                </linearGradient>
              </defs>
              <rect
                x="15"
                y="15"
                width="570"
                height="440"
                rx="70"
                fill="url(#sky)"
              />
              <circle cx="457" cy="102" r="39" fill="#ffc977" />
              <path
                d="M20 350Q170 285 315 345T580 315V410Q580 455 540 455H60Q15 455 15 410Z"
                fill="#c1ddcd"
              />
              <path d="M122 208L336 142L507 217L282 287Z" fill="#6d57b5" />
              <path d="M122 208v18l159 78 226-70v-17l-225 70Z" fill="#4f3d88" />
              <path
                d="M166 244V374M445 251V382M283 305V405"
                stroke="#897777"
                strokeWidth="12"
              />
              <path d="M169 237L332 189L444 228L284 281Z" fill="#9580db" />
              <path
                d="M204 218L292 192L346 215L258 243Z"
                fill="#354f67"
                stroke="#b4dcdf"
                strokeWidth="2"
              />
              <path
                d="M228 211l54 23M258 202l54 23M226 229l90-26"
                stroke="#84b9c4"
              />
              <path
                d="M300 196L388 220L338 235L250 210Z"
                fill="#3d6475"
                opacity=".3"
              />
              <ellipse cx="355" cy="283" rx="24" ry="7" fill="#69599a" />
              <path
                d="M355 281v20m0 0l-26 11m26-11l28 7m-28-7v23"
                stroke="#69599a"
                strokeWidth="5"
              />
              <path
                d="M183 331L284 376L394 342v16l-110 36-101-46Z"
                fill="#bb926a"
              />
              <path
                d="M211 348v32m154-22v33"
                stroke="#846552"
                strokeWidth="8"
              />
              <rect
                x="465"
                y="298"
                width="50"
                height="94"
                rx="15"
                fill="#73abb7"
              />
              <path d="M465 345h50" stroke="#c1e6e6" strokeWidth="3" />
              <path
                d="M500 232v38h-12v28"
                fill="none"
                stroke="#a8bfc0"
                strokeWidth="6"
              />
              <path
                d="M101 331v67m-27-14l27-29 25 17M540 330v62"
                stroke="#659570"
                strokeWidth="7"
              />
              <ellipse cx="98" cy="314" rx="38" ry="50" fill="#6fab88" />
              <ellipse cx="534" cy="313" rx="28" ry="41" fill="#8ac19a" />
              <path
                d="M64 412Q225 372 302 428T558 398"
                fill="none"
                stroke="#edeece"
                strokeWidth="15"
                strokeLinecap="round"
              />
            </svg>
            <div className="scene-note">
              <span className="badge good">CLIMATE SHELTER ZONE</span>
              <strong>Ruang teduh, terukur.</strong>
              <span>Vegetasi · ventilasi · energi · air</span>
            </div>
          </div>
        </section>
        <section id="tentang" className="landing-about">
          <span className="eyebrow">SEKOLAH TEDUH IKLIM</span>
          <h2>
            Satu ekosistem.
            <br />
            Banyak cara menjaga kenyamanan.
          </h2>
          <p>
            Climate Shelter menggabungkan desain pasif dengan pemantauan IoT.
            Data mikroklimat membantu sekolah memahami kondisi ruang, merawat
            vegetasi, dan mengatur pendinginan sesuai kebutuhan.
          </p>
        </section>
        <section id="teknologi" className="technology-grid">
          {[
            {
              icon: Sun,
              n: "01",
              title: "Teduh secara alami",
              text: "Motorized shading, cool roof, dan vegetasi mengurangi paparan panas pada ruang belajar.",
            },
            {
              icon: Wind,
              n: "02",
              title: "Udara yang terpantau",
              text: "Suhu, kelembapan, CO₂, PM2.5, dan heat stress membantu pengelola membaca kondisi lingkungan.",
            },
            {
              icon: Layers,
              n: "03",
              title: "Penyimpanan termal PCM",
              text: "Pantau suhu material dan estimasi perubahan fasanya sebagai bagian dari strategi pengelolaan panas.",
            },
            {
              icon: Droplets,
              n: "04",
              title: "Siklus air yang lebih baik",
              text: "Air hujan ditampung untuk smart irrigation; level tandon dan kelembapan tanah dipantau bersama.",
            },
          ].map(({ icon: Icon, n, title, text }) => (
            <article key={n}>
              <div>
                <Icon />
                <span>{n}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </section>
        <section className="landing-cta">
          <div>
            <span className="eyebrow">DATA MEMBANTU KITA PEDULI</span>
            <h2>Apa kabar iklim sekolah hari ini?</h2>
            <p>Lihat metrik yang dibagikan sekolah, tanpa perlu masuk.</p>
          </div>
          <Link href="/monitoring" className="button primary">
            Buka monitoring <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
export function PublicMonitoring({
  initial,
  error: initialError,
  serverTime,
}: {
  initial: PublicMonitor[];
  error?: string;
  serverTime: number;
}) {
  const [rows, setRows] = useState(initial),
    [selected, setSelected] = useState(initial[0]?.school.id ?? ""),
    [error, setError] = useState(initialError ?? ""),
    [now, setNow] = useState(serverTime);
  useEffect(() => {
    let active = true,
      fetching = false;
    let debounce: ReturnType<typeof setTimeout>;
    const update = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const r = await fetch("/api/public", { cache: "no-store" });
        if (!r.ok)
          throw new Error(
            "Pembaruan belum tersedia. Silakan coba kembali nanti.",
          );
        const value = await r.json();
        if (active) {
          setRows(value);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Pembaruan belum tersedia.",
          );
      } finally {
        fetching = false;
      }
    };
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => void update(), isDemo ? 3000 : 60000);
    const focus = () => void update();
    window.addEventListener("focus", focus);
    const cleanup = () => {
      active = false;
      clearInterval(clock);
      clearInterval(poll);
      clearTimeout(debounce);
      window.removeEventListener("focus", focus);
    };
    if (isDemo) return cleanup;
    const db = browserClient(),
      ch = db
        .channel("public-monitoring")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "public_monitoring" },
          () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => void update(), 700);
          },
        )
        .subscribe();
    return () => {
      cleanup();
      void db.removeChannel(ch);
    };
  }, []);
  const [selectedLocation, setSelectedLocation] = useState("shelter");
  const d = rows.find((r) => r.school.id === selected) ?? rows[0];
  const locations = d?.locations ?? (d ? [{ ...d, location: d.location ?? { id: "shelter", name: "Shelter" } }] : []);
  const area = locations.find(l => l.location.id === selectedLocation) ?? locations[0];
  return (
    <div className="public-site">
      <PublicNav />
      <main className="public-monitor">
        {rows.length > 0 && <div className="monitor-location-selectors">
          <label>
            Sekolah
            <select
              value={d?.school.id}
              onChange={(e) => { setSelected(e.target.value); setSelectedLocation("shelter"); }}
            >
              {rows.map((r) => (
                <option key={r.school.id} value={r.school.id}>
                  {r.school.name}
                </option>
              ))}
            </select>
          </label>
          <label>Lokasi di sekolah<select value={area?.location.id ?? ""} onChange={e => setSelectedLocation(e.target.value)}>{locations.map(l => <option key={l.location.id} value={l.location.id}>{l.location.name}</option>)}</select></label>
        </div>}
        {error && (
          <div className="notice" role="status">
            {error}
          </div>
        )}
        {!d ? (
          <div className="empty-state">
            Belum ada sekolah yang membagikan monitoring publik.
          </div>
        ) : (
          <div key={`${d.school.id}-${area.location.id}`}>
            <UserMonitoringSummary
              row={area.latest}
              now={now}
              demo={area.demo === true}
              wokwi={area.wokwi}
              locationName={area.location.name}
              school={d.school.name}
              pcmRange={area.pcm_range}
            />
            <UserMonitoringChart rows={area.history} now={now} />
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
