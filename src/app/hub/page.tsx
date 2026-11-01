import { loadHub } from "@/lib/hub-data";
import { LearningHub } from "@/components/hub/learning-hub";
import { googleConnectionState } from "@/lib/google-drive";
import { loadParticipation } from "@/lib/participation-data";
import {
  loadStudentToday,
  loadReviewQueue,
} from "@/lib/learning-queues-server";
import { requireProfile } from "@/lib/auth";
import { searchSchema } from "@/lib/classroom-insights";
import { loadOverview, loadRecordSearch } from "@/lib/insights-server";
import {
  loadGrowth,
  loadTerms,
  loadHandovers,
} from "@/lib/growth-terms-server";
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
    "terms",
    ...(profile.role === "teacher" ? ["review", "packs", "overview"] : []),
  ];
  const tab = params.tab && allowed.includes(params.tab) ? params.tab : "today";
  const parsed = searchSchema.safeParse(params);
  const filters = parsed.success ? parsed.data : searchSchema.parse({});
  const [
    data,
    google,
    participation,
    studentToday,
    overview,
    search,
    growth,
    terms,
    reviewQueue,
    handovers,
  ] = await Promise.all([
    loadHub(
      ["search", "overview"].includes(tab) ? 1 : Number(params.page ?? 1),
      tab,
    ),
    googleConnectionState(),
    ["growth", "economy", "exhibitions", "packs"].includes(tab)
      ? loadParticipation()
      : Promise.resolve(null),
    tab === "today" && profile.role === "student"
      ? loadStudentToday(Number(params.todayPage ?? 1))
      : Promise.resolve(null),
    profile.role === "teacher" && ["today", "overview"].includes(tab)
      ? loadOverview(filters.classroom, filters.page)
      : Promise.resolve(null),
    tab === "search" &&
    parsed.success &&
    (profile.consent_status === "verified" || profile.role === "teacher")
      ? loadRecordSearch(filters)
      : Promise.resolve(null),
    tab === "growth" || (tab === "reading" && profile.role === "student")
      ? loadGrowth()
      : Promise.resolve(null),
    tab === "terms"
      ? loadTerms(params.classroom, Number(params.rosterPage ?? 1))
      : Promise.resolve(null),
    tab === "review" && profile.role === "teacher"
      ? loadReviewQueue(
          params.classroom,
          params.reviewKind,
          Number(params.reviewPage ?? 1),
        )
      : Promise.resolve(null),
    tab === "terms" && profile.role === "teacher"
      ? loadHandovers()
      : Promise.resolve(null),
  ]);
  return (
    <LearningHub
      data={data}
      initialTab={tab}
      google={google}
      googleNotice={params.google}
      participation={participation}
      studentToday={studentToday}
      reviewQueue={reviewQueue}
      handovers={handovers}
      overview={overview}
      search={search}
      filters={filters}
      growth={growth}
      terms={terms}
      searchError={
        !parsed.success
          ? "검색 조건을 확인해 주세요. 검색어는 100자까지, 시작 날짜는 끝 날짜 이전으로 입력해 주세요."
          : undefined
      }
    />
  );
}
