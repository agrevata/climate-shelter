import Link from "next/link";
import { redirect } from "next/navigation";
import { loadDashboard } from "@/lib/data";
import { HttpError } from "@/lib/request";
import { DashboardProvider } from "@/components/dashboard-provider";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  let data;
  try {
    data = await loadDashboard();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    return (
      <main className="setup-error">
        <h1>Data belum tersedia</h1>
        <p>
          {e instanceof HttpError
            ? e.message
            : "Periksa konfigurasi Supabase dan migration."}
        </p>
        <Link className="button" href="/dashboard">
          Coba lagi
        </Link>
        <Link className="button" href="/login">
          Ke halaman masuk
        </Link>
      </main>
    );
  }
  return (
    <DashboardProvider initial={data}>
      <Shell>{children}</Shell>
    </DashboardProvider>
  );
}
