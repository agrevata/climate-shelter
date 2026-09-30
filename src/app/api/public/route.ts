import { NextResponse } from "next/server";
import { loadPublic } from "@/lib/public-data";
export async function GET() {
  try {
    return NextResponse.json(await loadPublic(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Monitoring belum tersedia. Coba kembali nanti." },
      { status: 503 },
    );
  }
}
