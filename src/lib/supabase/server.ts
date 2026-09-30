import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseConfig } from "../env";
export async function serverClient() {
  const jar = await cookies();
  const { url, key } = publicSupabaseConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (updates) => {
        try {
          updates.forEach(({ name, value, options }) =>
            jar.set(name, value, {
              ...options,
              ...(jar.get("cs_remember")?.value === "session" && value
                ? { maxAge: undefined, expires: undefined }
                : {}),
            }),
          );
        } catch {
          /* Server Components cannot write cookies; proxy refreshes the session. */
        }
      },
    },
  });
}
