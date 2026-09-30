import "server-only";
import { createHash } from "node:crypto";
import { adminClient } from "./supabase/admin";
import { HttpError, localRateLimit } from "./request";
import { isDemo } from "./env";
export async function authenticateDevice(request: Request) {
  if (isDemo)
    throw new HttpError("Ingest perangkat tidak tersedia pada mode demo.", 409);
  localRateLimit("iot-ip:" + request.headers.get("x-forwarded-for"), 300);
  const match = /^Bearer cs_([a-f0-9-]{36})_([a-f0-9]{64})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match) throw new HttpError("Autentikasi perangkat gagal.", 401);
  const db = adminClient();
  const { data, error } = await db.rpc("authorize_device", {
    p_key: match[1],
    p_hash: createHash("sha256").update(match[2]).digest("hex"),
  });
  if (error || !data)
    throw new HttpError(
      error?.code === "P0001"
        ? "Batas permintaan perangkat tercapai."
        : "Autentikasi perangkat gagal.",
      error?.code === "P0001" ? 429 : 401,
    );
  return { db, deviceId: data as string };
}
