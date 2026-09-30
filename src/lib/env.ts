// Vercel must never serve in-memory demo sessions or local JSON telemetry.
export const isDemo = process.env.VERCEL !== "1" && process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
export function publicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error(
      "Konfigurasi Supabase belum lengkap. Isi .env.local atau aktifkan mode demo.",
    );
  return { url, key };
}
