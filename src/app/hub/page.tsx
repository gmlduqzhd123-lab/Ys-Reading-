import { loadHub } from "@/lib/hub-data";
import { LearningHub } from "@/components/hub/learning-hub";
import { googleConnectionState } from "@/lib/google-drive";
import { loadParticipation } from "@/lib/participation-data";
import { loadDashboard } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { searchSchema } from "@/lib/classroom-insights";
import { loadOverview, loadRecordSearch } from "@/lib/insights-server";
export const metadata = { title: "나의 책장 · 함께 자라는 책숲" };
export default async function HubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const allowed = [
    "today",
    "reading",
    "exports",
    "growth",
    "plaza",
    "exhibitions",
    "economy",
    "manage",
    "search",
    ...(profile.role === "teacher" ? ["review", "packs", "overview"] : []),
  ];
  const tab = params.tab && allowed.includes(params.tab) ? params.tab : "today";
  const parsed = searchSchema.safeParse(params);
  const filters = parsed.success ? parsed.data : searchSchema.parse({});
  const [data, google, participation, dashboard, overview, search] =
    await Promise.all([
      loadHub(
        ["search", "overview"].includes(tab) ? 1 : Number(params.page ?? 1),
        tab,
      ),
      googleConnectionState(),
      ["growth", "economy", "exhibitions", "packs", "review"].includes(tab)
        ? loadParticipation()
        : Promise.resolve(null),
      (tab === "today" && profile.role === "student") || tab === "review"
        ? loadDashboard()
        : Promise.resolve(null),
      profile.role === "teacher" && ["today", "overview"].includes(tab)
        ? loadOverview(filters.classroom, filters.page)
        : Promise.resolve(null),
      tab === "search" &&
      parsed.success &&
      (profile.consent_status === "verified" || profile.role === "teacher")
        ? loadRecordSearch(filters)
        : Promise.resolve(null),
    ]);
  return (
    <LearningHub
      data={data}
      initialTab={tab}
      google={google}
      googleNotice={params.google}
      participation={participation}
      dashboard={dashboard}
      overview={overview}
      search={search}
      filters={filters}
      searchError={
        !parsed.success
          ? "검색 조건을 확인해 주세요. 검색어는 100자까지, 시작 날짜는 끝 날짜 이전으로 입력해 주세요."
          : undefined
      }
    />
  );
}
