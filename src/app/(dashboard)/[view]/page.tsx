import { redirect, notFound } from "next/navigation";
import { views } from "@/lib/types";
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!(views as readonly string[]).includes(view)) notFound();
  redirect("/dashboard/" + (view === "devices" ? "control" : view));
}
