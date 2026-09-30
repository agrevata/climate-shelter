"use client";
import { useState } from "react";
import Link from "next/link";
import { postJSON } from "./dashboard-provider";
export function PasswordForm({ reset = false }: { reset?: boolean }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="setup-error">
      <h1>{reset ? "Buat kata sandi baru" : "Pulihkan akun"}</h1>
      <p>
        {reset
          ? "Gunakan minimal 12 karakter."
          : "Tautan pemulihan akan dikirim jika akun tersedia."}
      </p>
      <form
        className="platform-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            const result = await postJSON(
              "/api/auth/password",
              reset
                ? { action: "update", password: f.get("password") }
                : { action: "request", email: f.get("email") },
            );
            setMessage(
              result.message || "Kata sandi diperbarui. Silakan masuk kembali.",
            );
          } catch (err) {
            setMessage(
              err instanceof Error ? err.message : "Permintaan gagal.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {reset ? "Kata sandi baru" : "Email"}
          <input
            name={reset ? "password" : "email"}
            type={reset ? "password" : "email"}
            autoComplete={reset ? "new-password" : "email"}
            required
            minLength={reset ? 12 : undefined}
            maxLength={reset ? 128 : 254}
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy
            ? "Memproses…"
            : reset
              ? "Simpan kata sandi"
              : "Kirim tautan pemulihan"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      <Link href="/login">Kembali ke login</Link>
    </main>
  );
}
