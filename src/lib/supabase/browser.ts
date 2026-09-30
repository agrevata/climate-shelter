"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "../env";
export function browserClient() {
  const { url, key } = publicSupabaseConfig();
  return createBrowserClient(url, key, {
    cookieOptions: document.cookie.includes("cs_remember=session")
      ? { maxAge: undefined, expires: undefined }
      : {},
  });
}
