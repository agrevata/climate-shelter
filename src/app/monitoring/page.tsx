import { PublicMonitoring } from "@/components/public-site";
import { loadPublic } from "@/lib/public-data";
import type { PublicMonitor } from "@/lib/public-types";
export default async function Page() {
  let data: PublicMonitor[] = [];
  let error;
  try {
    data = await loadPublic();
  } catch {
    error = "Monitoring belum tersedia. Periksa kembali nanti.";
  }
  return (
    <PublicMonitoring
      initial={data}
      error={error}
      serverTime={Date.parse(data[0]?.updated_at ?? "2000-01-01T00:00:00Z")}
    />
  );
}
