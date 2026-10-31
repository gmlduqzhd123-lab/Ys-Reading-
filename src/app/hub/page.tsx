import { loadHub } from "@/lib/hub-data";
import { LearningHub } from "@/components/hub/learning-hub";
import { googleConnectionState } from "@/lib/google-drive";
import { loadParticipation } from "@/lib/participation-data";
import { loadDashboard } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
export const metadata = { title: "나의 책장 · 함께 자라는 책숲" };
export default async function HubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; google?: string }>;
}) {
  const params = await searchParams;
  const profile=await requireProfile();
  const allowed=["today","reading","exports","growth","plaza","exhibitions","economy","manage",...(profile.role==="teacher"?["review","packs"]:[])];
  const tab=params.tab&&allowed.includes(params.tab)?params.tab:"today";
  const [data, google, participation, dashboard] = await Promise.all([
    loadHub(Number(params.page ?? 1), tab),
    googleConnectionState(),
    loadParticipation(),
    ["today","review"].includes(tab)?loadDashboard():Promise.resolve(null),
  ]);
  return <LearningHub data={data} initialTab={tab} google={google} googleNotice={params.google} participation={participation} dashboard={dashboard} />;
}
