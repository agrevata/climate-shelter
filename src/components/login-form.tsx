"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { postJSON } from "./dashboard-provider";
import { BrandLogo } from "./brand-logo";
export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/" className="login-brand">
          <BrandLogo /> Climate Shelter
        </Link>
        <span className="eyebrow">SEKOLAH TEDUH IKLIM</span>
        <h1>
          Ruang belajar
          <br />
          yang lebih sejuk.
        </h1>
        <p>
          Pantau mikroklimat. Rawat ruang hijau.
          <br />
          Lihat dampaknya, setiap hari.
        </p>
        <div className="login-stat">
          <span>
            Satu tempat untuk memahami
            <br />
            iklim di lingkungan sekolah.
          </span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <BrandLogo />
          <h2>Selamat datang kembali</h2>
          <p>Masuk ke ruang pengelola sekolah.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await postJSON(
                  "/api/auth/login",
                  demo
                    ? { demoRole: f.get("demoRole") }
                    : {
                        email: f.get("email"),
                        password: f.get("password"),
                        remember: f.get("remember") === "on",
                      },
                );
                router.replace("/dashboard");
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Login gagal.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {demo ? (
              <label>
                Masuk sebagai
                <select name="demoRole">
                  <option value="operator">Operator</option>
                  <option value="admin">Admin sekolah</option>
                  <option value="super_admin">Super admin</option>
                </select>
              </label>
            ) : (
              <>
                <label>
                  Email sekolah
                  <input
                    type="email"
                    name="email"
                    autoComplete="username"
                    required
                    maxLength={254}
                  />
                </label>
                <label>
                  Kata sandi
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </label>
                <label className="check-label">
                  <input name="remember" type="checkbox" /> Ingat saya di
                  perangkat ini
                </label>
                <Link href="/forgot-password" className="text-link">
                  Lupa kata sandi?
                </Link>
              </>
            )}
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Memeriksa…"
                : demo
                  ? "Masuk ke demo"
                  : "Masuk ke dashboard"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="login-help">
            <ShieldCheck size={16} /> Akses sekolah ditetapkan oleh super admin.
          </p>
          <Link href="/monitoring" className="text-link">
            Lihat monitoring publik →
          </Link>
        </div>
        <small>Climate Shelter School · Smart microclimate monitoring</small>
      </section>
    </main>
  );
}
