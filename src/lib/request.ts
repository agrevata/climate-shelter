import "server-only";
import { NextResponse } from "next/server";
import { appOrigin } from "./app-origin";
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireOrigin(request: Request) {
  const expected = appOrigin();
  if (request.headers.get("origin") !== expected)
    throw new HttpError("Asal permintaan ditolak.", 403);
}
export async function readJson(request: Request, maxBytes = 8192) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError("Gunakan JSON.", 415);
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    throw new HttpError("Payload terlalu besar.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError("Payload kosong.");
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError("Payload terlalu besar.", 413);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch {
    throw new HttpError("JSON tidak valid.");
  }
}
export function httpError(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "Permintaan tidak dapat diproses.",
    },
    { status: error instanceof HttpError ? error.status : 500 },
  );
}
const windows = new Map<string, { at: number; count: number }>();
export function localRateLimit(key: string, max = 15) {
  const now = Date.now();
  for (const [k, v] of windows) if (now - v.at > 60000) windows.delete(k);
  if (windows.size > 2000)
    throw new HttpError("Terlalu banyak permintaan.", 429);
  const w = windows.get(key) ?? { at: now, count: 0 };
  w.count++;
  windows.set(key, w);
  if (w.count > max)
    throw new HttpError("Terlalu banyak percobaan. Coba sebentar lagi.", 429);
}
