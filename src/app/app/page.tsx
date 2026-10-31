import { loadDashboard } from "@/lib/data";
import { Workspace } from "@/components/workspace";
import { redirect } from "next/navigation";
export const metadata = { title: "우리 교실" };
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  if(!params.view)redirect("/hub?tab=today");
  const data=await loadDashboard();
  return <Workspace data={data} initialView={params.view} />;
}
