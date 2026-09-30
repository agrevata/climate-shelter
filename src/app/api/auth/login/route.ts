import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { isDemo } from "@/lib/env";
import { serverClient } from "@/lib/supabase/server";
import { createDemoSession, DEMO_COOKIE } from "@/lib/demo-store";
import {
  HttpError,
  httpError,
  localRateLimit,
  readJson,
  requireOrigin,
} from "@/lib/request";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    localRateLimit("login:" + request.headers.get("x-forwarded-for"), 20);
    const input = await readJson(request);
    const jar = await cookies();
    jar.delete("climate_school");
    if (isDemo) {
      const p = z
        .object({
          demoRole: z.enum(["public", "operator", "admin", "super_admin"]),
        })
        .strict()
        .safeParse(input);
      if (!p.success) throw new HttpError("Peran demo tidak valid.", 400);
      const session = createDemoSession(p.data.demoRole);
      jar.set(DEMO_COOKIE, session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 8 * 3600,
      });
      return NextResponse.json({ ok: true, demo: true });
    }
    const p = z
      .object({
        email: z.email().max(254),
        password: z.string().min(8).max(128),
        remember: z.boolean(),
      })
      .strict()
      .safeParse(input);
    if (!p.success) throw new HttpError("Email atau kata sandi tidak valid.");
    jar.set("cs_remember", p.data.remember ? "persistent" : "session", {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      ...(p.data.remember ? { maxAge: 30 * 86400 } : {}),
    });
    const db = await serverClient();
    const { error } = await db.auth.signInWithPassword({
      email: p.data.email,
      password: p.data.password,
    });
    if (error)
      throw new HttpError(
        "Login gagal. Periksa email/kata sandi atau coba kembali nanti.",
        401,
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return httpError(e);
  }
}
