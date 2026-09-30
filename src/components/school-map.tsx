"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Droplets, Thermometer, Wind } from "lucide-react";
import { useDashboard } from "./dashboard-provider";
import { fmt, latestSensors, time } from "@/lib/metrics";
import { isFresh, riskLevel } from "../../shared/contracts";
const positions = {
  classroom: [45, 42, 260, 103],
  outside: [340, 43, 260, 243],
  shelter: [45, 190, 260, 96],
  garden: [45, 323, 555, 103],
};
const mapColors = {
  good: ["#e0f1e8", "#218d69"],
  amber: ["#fff1c9", "#ad7b15"],
  warning: ["#ffe0cc", "#c26a34"],
  danger: ["#fad4d5", "#bc5259"],
  neutral: ["#e8ebee", "#73818d"],
};
export function SchoolMap({ compact = false }: { compact?: boolean }) {
  const { data, now } = useDashboard();
  const [selected, setSelected] = useState(
    data.zones.find((z) => z.kind === "shelter")?.id ?? data.zones[0]?.id,
  );
  const latest = latestSensors(data);
  const zone = data.zones.find((z) => z.id === selected);
  const reading = selected ? latest.get(selected) : undefined;
  const risk = riskLevel(reading?.wbgt);
  return (
    <div className={`map-layout ${compact ? "compact" : ""}`}>
      <div className="map-canvas">
        <svg
          viewBox="0 0 645 462"
          role="group"
          aria-label="Denah konseptual empat zona sekolah. Pilih zona untuk melihat data."
        >
          <defs>
            <pattern
              id="map-grid"
              width="22"
              height="22"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M22 0H0V22"
                fill="none"
                stroke="var(--border)"
                strokeWidth="0.6"
              />
            </pattern>
          </defs>
          <rect width="645" height="462" rx="12" fill="var(--map-bg)" />
          <rect width="645" height="462" rx="12" fill="url(#map-grid)" />
          <path
            d="M20 167H625M20 303H625M322 20V440"
            stroke="var(--map-path)"
            strokeWidth="15"
          />
          <path
            d="M322 20V440M20 167H625M20 303H625"
            stroke="var(--surface)"
            strokeDasharray="5 6"
            fill="none"
          />
          {data.zones.map((z) => {
            const [x, y, w, h] = positions[z.kind];
            const r = latest.get(z.id);
            const fresh = r && isFresh(r.recorded_at, now);
            const tone = fresh ? riskLevel(r?.wbgt).tone : "neutral";
            const [fill, stroke] = mapColors[tone];
            return (
              <g
                key={z.id}
                tabIndex={0}
                role="button"
                aria-label={`${z.name}, ${fmt(r?.temperature)} derajat Celsius${fresh ? "" : ", data kedaluwarsa"}`}
                aria-pressed={selected === z.id}
                onClick={() => setSelected(z.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(z.id);
                  }
                }}
                className="map-zone"
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx="10"
                  fill={fill}
                  stroke={selected === z.id ? "#7754e9" : stroke}
                  strokeWidth={selected === z.id ? 3 : 1}
                  strokeOpacity={selected === z.id ? 1 : 0.3}
                />
                {z.kind === "outside" && (
                  <g opacity="0.3" fill="none" stroke={stroke}>
                    <rect
                      x={x + 22}
                      y={y + 20}
                      width={w - 44}
                      height={h - 40}
                    />
                    <path d={`M${x + 22} ${y + h / 2}h${w - 44}`} />
                    <circle cx={x + w / 2} cy={y + h / 2} r="32" />
                  </g>
                )}
                {z.kind === "shelter" && (
                  <g stroke={stroke} opacity="0.16">
                    {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                      <path
                        key={n}
                        d={`M${x + 15 + n * 35} ${y + 7}v${h - 14}`}
                        strokeWidth="12"
                      />
                    ))}
                  </g>
                )}
                <text
                  x={x + 19}
                  y={y + 32}
                  fill="#374449"
                  fontSize="15"
                  fontWeight="600"
                >
                  {z.name}
                </text>
                <text
                  x={x + 19}
                  y={y + 62}
                  fill={stroke}
                  fontSize="25"
                  fontWeight="650"
                >
                  {fmt(r?.temperature)}
                  <tspan fontSize="15"> °C</tspan>
                </text>
                <text
                  x={x + w - 18}
                  y={y + h - 16}
                  textAnchor="end"
                  fill={stroke}
                  fontSize="12"
                >
                  {fresh
                    ? selected === z.id
                      ? "ZONA DIPILIH"
                      : riskLevel(r?.wbgt).label.toUpperCase()
                    : "DATA LAMA"}
                </text>
              </g>
            );
          })}
          <text
            x="623"
            y="24"
            textAnchor="end"
            fill="var(--muted)"
            fontSize="12"
          >
            U ↑
          </text>
        </svg>
        <div className="map-legend">
          <span>
            <i style={{ background: "#5baa84" }} />
            Rendah
          </span>
          <span>
            <i style={{ background: "#e4b448" }} />
            Waspada
          </span>
          <span>
            <i style={{ background: "#e89965" }} />
            Tinggi
          </span>
          <span>
            <i style={{ background: "#db7579" }} />
            Sangat tinggi
          </span>
        </div>
      </div>
      {!compact && zone && (
        <aside className="zone-detail">
          <span className="eyebrow">ZONA TERPILIH</span>
          <h3>{zone.name}</h3>
          <span className={`badge ${risk.tone}`}>WBGT · {risk.label}</span>
          <p>{zone.description}</p>
          <div className="zone-temperature">
            {fmt(reading?.temperature)}
            <small>°C</small>
          </div>
          <div className="detail-row">
            <span>
              <Droplets size={16} /> Kelembapan
            </span>
            <strong>{fmt(reading?.humidity, 0)}%</strong>
          </div>
          <div className="detail-row">
            <span>
              <Wind size={16} /> WBGT
            </span>
            <strong>{fmt(reading?.wbgt)}°C</strong>
          </div>
          <div className="detail-row">
            <span>
              <Thermometer size={16} /> Permukaan
            </span>
            <strong>{fmt(reading?.surface_temperature)}°C</strong>
          </div>
          <p className="small muted">
            {reading
              ? `Terakhir: ${time(reading.recorded_at, true)} WIB${isFresh(reading.recorded_at, now) ? "" : " · data kedaluwarsa"}`
              : "Menunggu pembacaan sensor"}
          </p>
          <Link className="text-link" href="/analytics">
            Buka Analytics <ArrowUpRight size={16} />
          </Link>
        </aside>
      )}
    </div>
  );
}
