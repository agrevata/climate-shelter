"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="setup-error">
      <h1>Halaman belum dapat dimuat</h1>
      <p>Terjadi kesalahan saat menampilkan halaman. Coba muat kembali.</p>
      <button className="button primary" onClick={retry}>
        Coba lagi
      </button>
    </main>
  );
}
