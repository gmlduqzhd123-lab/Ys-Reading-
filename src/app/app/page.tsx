import { loadDashboard } from "@/lib/data";
import { Workspace } from "@/components/workspace";
export const metadata = { title: "우리 교실" };
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [data, params] = await Promise.all([loadDashboard(), searchParams]);
  return <Workspace data={data} initialView={params.view} />;
}
