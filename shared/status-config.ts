// Initial project thresholds, not a clinical assessment. Change them here.
export const monitoringThresholds = {
  temperature: { cold: 20, comfortable: 27, warm: 30 },
  humidity: { dry: 40, normal: 70 },
  co2: { good: 800, moderate: 1200 },
  pm25: { good: 35, moderate: 75 },
  comfort: { comfortable: 75, moderate: 60 },
  staleMs: 120_000,
};
export type Status = {
  label: string;
  description: string;
  tone: "good" | "neutral" | "warning" | "danger";
};
type Value = number | null | undefined;
const valid = (v: Value): v is number => v != null && Number.isFinite(v);
const missing: Status = {
  label: "Belum tersedia",
  description: "Menunggu data dari perangkat…",
  tone: "neutral",
};
export function temperatureStatus(v: Value): Status {
  if (!valid(v)) return missing;
  const t = monitoringThresholds.temperature;
  if (v < t.cold)
    return {
      label: "Dingin",
      description: "Suhu di bawah rentang nyaman",
      tone: "warning",
    };
  if (v <= t.comfortable)
    return {
      label: "Nyaman",
      description: "Suhu dalam rentang nyaman",
      tone: "good",
    };
  if (v <= t.warm)
    return {
      label: "Hangat",
      description: "Suhu ruangan mulai hangat",
      tone: "warning",
    };
  return {
    label: "Panas",
    description: "Suhu ruangan perlu perhatian",
    tone: "danger",
  };
}
export function humidityStatus(v: Value): Status {
  if (!valid(v)) return missing;
  if (v < monitoringThresholds.humidity.dry)
    return {
      label: "Kering",
      description: "Kelembapan udara rendah",
      tone: "warning",
    };
  if (v <= monitoringThresholds.humidity.normal)
    return {
      label: "Normal",
      description: "Kelembapan dalam rentang nyaman",
      tone: "good",
    };
  return {
    label: "Lembap",
    description: "Kelembapan udara tinggi",
    tone: "warning",
  };
}
export function co2Status(v: Value): Status {
  if (!valid(v)) return missing;
  if (v <= monitoringThresholds.co2.good)
    return {
      label: "Baik",
      description: "CO₂ dalam rentang pemantauan yang baik",
      tone: "good",
    };
  if (v <= monitoringThresholds.co2.moderate)
    return {
      label: "Sedang",
      description: "CO₂ meningkat; ventilasi disarankan",
      tone: "warning",
    };
  return {
    label: "Tinggi",
    description: "Kadar CO₂ perlu perhatian",
    tone: "danger",
  };
}
export function pm25Status(v: Value): Status {
  if (!valid(v)) return missing;
  if (v <= monitoringThresholds.pm25.good)
    return {
      label: "Baik",
      description: "Partikel halus dalam rentang pemantauan yang baik",
      tone: "good",
    };
  if (v <= monitoringThresholds.pm25.moderate)
    return {
      label: "Sedang",
      description: "Partikel halus meningkat",
      tone: "warning",
    };
  return {
    label: "Buruk",
    description: "Kadar partikel halus perlu perhatian",
    tone: "danger",
  };
}
export function thermalScoreStatus(v: Value): Status {
  if (!valid(v)) return missing;
  if (v >= monitoringThresholds.comfort.comfortable)
    return {
      label: "Nyaman",
      description: "Kondisi ruang mendukung kenyamanan penghuni",
      tone: "good",
    };
  if (v >= monitoringThresholds.comfort.moderate)
    return {
      label: "Cukup Nyaman",
      description: "Kenyamanan ruang masih dapat ditingkatkan",
      tone: "warning",
    };
  return {
    label: "Tidak Nyaman",
    description: "Kondisi ruang kurang nyaman bagi penghuni",
    tone: "danger",
  };
}
export function getAirQualityStatus(co2: Value, pm25: Value): Status {
  if (!valid(co2) || !valid(pm25)) return missing;
  const tones = [co2Status(co2).tone, pm25Status(pm25).tone];
  if (tones.includes("danger"))
    return {
      label: "Buruk",
      description: "Kualitas udara membutuhkan perhatian",
      tone: "danger",
    };
  if (tones.includes("warning"))
    return {
      label: "Sedang",
      description: "Kualitas udara menurun; ventilasi disarankan",
      tone: "warning",
    };
  return {
    label: "Baik",
    description: "CO₂ dan PM2.5 dalam rentang pemantauan yang baik",
    tone: "good",
  };
}
export const airQualityStatus = getAirQualityStatus;
export function pcmPhaseStatus(v: Value, start: number, end: number) {
  if (!valid(v) || !valid(start) || !valid(end) || start >= end)
    return { ...missing, explanation: missing.description };
  const label = v < start ? "Solid" : v > end ? "Liquid" : "Transition";
  return {
    label,
    tone: "neutral" as const,
    explanation:
      label === "Solid"
        ? "PCM dalam fase padat"
        : label === "Liquid"
          ? "PCM berada dalam fase cair"
          : "PCM sedang menyimpan atau melepaskan energi panas",
  };
}
export function getOverallRoomStatus(
  temp: Value,
  humidity: Value,
  co2: Value,
  pm25: Value,
  score: Value,
): Status {
  if (![temp, humidity, co2, pm25, score].every(valid))
    return {
      ...missing,
      description: "Data lingkungan belum lengkap untuk menilai kondisi ruang.",
    };
  const tones = [
    temperatureStatus(temp),
    humidityStatus(humidity),
    co2Status(co2),
    pm25Status(pm25),
    thermalScoreStatus(score),
  ].map((s) => s.tone);
  if (tones.includes("danger"))
    return {
      label: "Tidak Ideal",
      description: "Kondisi lingkungan membutuhkan perhatian pengelola.",
      tone: "danger",
    };
  if (tones.includes("warning"))
    return {
      label: "Perlu Perhatian",
      description:
        "Sebagian kondisi lingkungan belum mendukung kenyamanan ruang.",
      tone: "warning",
    };
  return {
    label: "Nyaman",
    description:
      "Suhu, kelembapan, kualitas udara, dan kenyamanan termal dalam kondisi baik.",
    tone: "good",
  };
}
export function telemetryState(recordedAt: string | undefined, now: number) {
  const timestamp = recordedAt ? Date.parse(recordedAt) : NaN;
  if (!Number.isFinite(timestamp)) return "empty";
  return now - timestamp > monitoringThresholds.staleMs ||
    timestamp > now + 60_000
    ? "offline"
    : "fresh";
}
