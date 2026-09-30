import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth";
import { createDemo } from "@/lib/demo";
import { requireOrigin, httpError, HttpError } from "@/lib/request";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await requireAccount();
    if (!a.demo) throw new HttpError("Hanya tersedia pada demo.", 409);
    const fresh = createDemo();
    fresh.role = a.demo.role;
    fresh.user = a.demo.data.user;
    a.demo.data = fresh;
    a.demo.schoolCache.clear();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return httpError(e);
  }
}
