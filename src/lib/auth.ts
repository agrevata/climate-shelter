import "server-only";
import { serverClient } from "./supabase/server";
import { isDemo } from "./env";
import { demoSession } from "./demo-store";
import { HttpError } from "./request";
import type { Role } from "./types";
export async function requireAccount() {
  if (isDemo) {
    const s = await demoSession();
    if (!s) throw new HttpError("Silakan masuk.", 401);
    return { user: s.data.user, db: null, demo: s };
  }
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new HttpError("Silakan masuk.", 401);
  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      name: String(user.user_metadata?.full_name ?? "Pengelola"),
    },
    db,
    demo: null,
  };
}
export async function requireSchool(
  schoolId: string,
  roles: Role[] = ["admin", "operator", "public"],
) {
  const auth = await requireAccount();
  if (auth.demo) {
    if (!roles.includes(auth.demo.role) && auth.demo.role !== "super_admin")
      throw new HttpError("Hak akses tidak mencukupi.", 403);
    if (
      auth.demo.role !== "super_admin" &&
      schoolId !== auth.demo.data.school.id
    )
      throw new HttpError("Sekolah tidak dapat diakses.", 403);
    return auth;
  }
  const { data, error } = await auth.db!.rpc("has_school_role", {
    p_school: schoolId,
    p_roles: roles,
  });
  if (error || !data) throw new HttpError("Sekolah tidak dapat diakses.", 403);
  return auth;
}
export async function requireSuperAdmin() {
  const auth = await requireAccount();
  if (auth.demo) {
    if (auth.demo.role !== "super_admin")
      throw new HttpError("Hanya super admin dapat menetapkan sekolah dan akses akun.", 403);
  } else {
    const { data, error } = await auth.db!.rpc("is_super_admin");
    if (error || !data)
      throw new HttpError("Hanya super admin dapat menetapkan sekolah dan akses akun.", 403);
  }
  return auth;
}
export async function requireDevice(
  deviceId: string,
  roles: Role[] = ["admin", "operator"],
) {
  const auth = await requireAccount();
  if (auth.demo) {
    const d = auth.demo.data.devices.find((d) => d.id === deviceId);
    if (
      !d || d.school_id !== auth.demo.data.school.id ||
      (!roles.includes(auth.demo.role) && auth.demo.role !== "super_admin")
    )
      throw new HttpError("Perangkat tidak dapat diakses.", 403);
    return { ...auth, device: d };
  }
  const { data: device, error } = await auth
    .db!.from("devices")
    .select("*")
    .eq("id", deviceId)
    .single();
  if (error || !device)
    throw new HttpError("Perangkat tidak dapat diakses.", 403);
  const { data: allowed } = await auth.db!.rpc("has_school_role", {
    p_school: device.school_id,
    p_roles: roles,
  });
  if (!allowed) throw new HttpError("Hak akses tidak mencukupi.", 403);
  return { ...auth, device };
}
