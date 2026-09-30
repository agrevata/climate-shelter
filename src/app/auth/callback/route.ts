import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-origin";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = appOrigin();
  if (!base)
    return NextResponse.json(
      { error: "Konfigurasi server belum lengkap." },
      { status: 503 },
    );
  const code = url.searchParams.get("code");
  const next =
    url.searchParams.get("next") === "/reset-password"
      ? "/reset-password"
      : "/dashboard";
  if (code) {
    const { error } = await (
      await serverClient()
    ).auth.exchangeCodeForSession(code);
    if (!error) {
      if (next === "/reset-password")
        (await cookies()).set("cs_recovery", "1", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 600,
        });
      return NextResponse.redirect(new URL(next, base));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", base));
}
