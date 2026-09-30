import Link from "next/link";
export default function NotFound() {
  return (
    <main className="setup-error">
      <h1>Halaman tidak ditemukan</h1>
      <Link className="button primary" href="/overview">
        Kembali ke Overview
      </Link>
    </main>
  );
}
