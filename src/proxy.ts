import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDemo, publicSupabaseConfig } from "./lib/env";
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let connections = "'self'";
  if (supabase) {
    const u = new URL(supabase);
    connections += ` ${u.origin} ${u.origin.replace(/^http/, "ws")}`;
  }
  if (dev) connections += " ws://localhost:* ws://127.0.0.1:*";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connections}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  let response = NextResponse.next({ request: { headers } });
  const machineRequest = request.nextUrl.pathname.startsWith("/api/iot/") || request.nextUrl.pathname === "/api/wokwi/telemetry";
  if (!machineRequest && !isDemo && supabase && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    const { url, key } = publicSupabaseConfig();
    const db = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(updates) {
          updates.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          headers.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers } });
          updates.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              ...(request.cookies.get("cs_remember")?.value === "session" &&
              value
                ? { maxAge: undefined, expires: undefined }
                : {}),
            }),
          );
        },
      },
    });
    await db.auth.getUser();
  }
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
