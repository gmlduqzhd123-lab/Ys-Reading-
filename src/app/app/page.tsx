import { loadDashboard } from "@/lib/data";
import { Workspace } from "@/components/workspace";
import { redirect } from "next/navigation";
import { z } from "zod";
export const metadata = { title: "우리 교실" };
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  if (!params.view) redirect("/hub?tab=today");
  const page = (v: string | undefined) => {
    const n = Number(v ?? 1);
    return Number.isSafeInteger(n) && n > 0 && n <= 1000000 ? n : 1;
  };
  const view = [
    "missions",
    "feedback",
    "forest",
    "contests",
    "classes",
  ].includes(params.view)
    ? params.view
    : "missions";
  const data = await loadDashboard({
    view,
    classroom: z.uuid().safeParse(params.classroom).success
      ? params.classroom
      : undefined,
    page: page(params.page),
    entryPage: page(params.entryPage),
    status: ["submitted", "revision_requested", "completed", "all"].includes(
      params.status ?? "",
    )
      ? params.status
      : undefined,
  });
  return <Workspace data={data} initialView={params.view} />;
}
