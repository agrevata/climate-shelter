import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-origin";
export async function GET(request: Request) {
  const u = new URL(request.url),
    token = u.searchParams.get("token_hash"),
    type = u.searchParams.get("type");
  const origin = appOrigin();
  if (!token || !["invite", "recovery"].includes(type ?? ""))
    return NextResponse.redirect(new URL("/login?error=link", origin));
  const db = await serverClient();
  const { error } = await db.auth.verifyOtp({
    token_hash: token,
    type: type as "invite" | "recovery",
  });
  if (error) return NextResponse.redirect(new URL("/login?error=link", origin));
  (await cookies()).set("cs_recovery", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(new URL("/reset-password", origin));
}
