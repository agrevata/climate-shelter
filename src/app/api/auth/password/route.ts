import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { isDemo } from "@/lib/env";
import { serverClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-origin";
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
    localRateLimit("password:" + request.headers.get("x-forwarded-for"), 5);
    const input = await readJson(request);
    if (isDemo)
      throw new HttpError("Reset kata sandi tersedia pada mode Supabase.", 409);
    const p = z
      .discriminatedUnion("action", [
        z
          .object({ action: z.literal("request"), email: z.email().max(254) })
          .strict(),
        z
          .object({
            action: z.literal("update"),
            password: z.string().min(12).max(128),
          })
          .strict(),
      ])
      .safeParse(input);
    if (!p.success)
      throw new HttpError(
        "Input tidak valid. Kata sandi baru minimal 12 karakter.",
      );
    const db = await serverClient();
    if (p.data.action === "request") {
      await db.auth.resetPasswordForEmail(p.data.email, {
        redirectTo: new URL(
          "/auth/callback?next=/reset-password",
          appOrigin(),
        ).toString(),
      });
      return NextResponse.json({
        ok: true,
        message: "Jika akun terdaftar, tautan reset akan dikirim ke email.",
      });
    }
    const jar = await cookies();
    if (jar.get("cs_recovery")?.value !== "1")
      throw new HttpError("Gunakan tautan pemulihan dari email.", 403);
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new HttpError("Tautan pemulihan kedaluwarsa.", 401);
    const { error } = await db.auth.updateUser({ password: p.data.password });
    if (error)
      throw new HttpError(
        "Kata sandi belum dapat diperbarui. Minta tautan baru.",
      );
    jar.delete("cs_recovery");
    await db.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return httpError(e);
  }
}
