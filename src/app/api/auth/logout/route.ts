import { NextResponse } from "next/server";
import { isDemo } from "@/lib/env";
import { clearDemoSession } from "@/lib/demo-store";
import { serverClient } from "@/lib/supabase/server";
import { httpError, requireOrigin } from "@/lib/request";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    if (isDemo) await clearDemoSession();
    else await (await serverClient()).auth.signOut({ scope: "local" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return httpError(e);
  }
}
