import { notFound, redirect } from "next/navigation";
import { PlatformView } from "@/components/platform-view";
import { platformViews } from "@/lib/types";
import { loadDashboard } from "@/lib/data";
import { HttpError } from "@/lib/request";
import { canAccessDashboardView } from "../../../../shared/monitoring-access";
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!platformViews.includes(view)) notFound();
  let data;
  try {
    data = await loadDashboard();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    throw e;
  }
  if (!canAccessDashboardView(data.role, view)) notFound();
  return <PlatformView view={view} />;
}
