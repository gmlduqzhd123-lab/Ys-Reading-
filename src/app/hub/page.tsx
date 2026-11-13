import { loadHub } from "@/lib/hub-data";
import { redirect } from "next/navigation";
import {cookies} from "next/headers";
import {z} from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  PlazaReports,
  type PlazaReportState,
} from "@/components/participation/plaza-reports";
import { LearningHub } from "@/components/hub/learning-hub";
import { googleConnectionState } from "@/lib/google-drive";
import { loadParticipation } from "@/lib/participation-data";
import {
  loadStudentToday,
  loadReviewQueue,
} from "@/lib/learning-queues-server";
import { requireProfile } from "@/lib/auth";
import type {ClassroomToolState} from '@/lib/classroom-tools';
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
  if(params.classroom===undefined){const remembered=(await cookies()).get("bf_class_"+profile.id)?.value;if(remembered&&z.uuid().safeParse(remembered).success){const c=await createClient(),r=await c.from("classrooms").select("id").eq("id",remembered).maybeSingle();if(r.data)params.classroom=remembered;}}
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
  // Capture the visible version before loading page data. The first browser
  // probe can then detect updates that arrive during rendering/hydration.
  let learningToken="";
  if(profile.role==="teacher"||profile.consent_status==="verified")try{const client=await createClient(),r=await client.rpc("learning_change_token",{p_classroom:filters.classroom||null}).abortSignal(AbortSignal.timeout(5000));if(typeof r.data==="string")learningToken=r.data;}catch{}
  const data = await loadHub(
    ["search", "overview"].includes(tab) ? 1 : Number(params.page ?? 1),
    tab,
    filters.classroom,
  );
  if (profile.role === "teacher") {
    const staff = data.staffClasses ?? [],
      owns = staff.some((c) => c.owner),
      canRead = staff.some((c) => c.read),
      canReview = staff.some((c) => c.review);
    if (
      (!owns &&
        [
          "growth",
          "plaza",
          "exhibitions",
          "economy",
          "manage",
          "terms",
          "packs",
        ].includes(tab)) ||
      (!canRead &&
        ["reading", "search", "exports", "overview"].includes(tab)) ||
      (!canReview && tab === "review")
    )
      redirect("/collaboration");
  }
  const [
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
  let plazaReports: PlazaReportState | null = null;
  if (
    tab === "plaza" &&
    (profile.role === "teacher" || profile.consent_status === "verified")
  ) {
    const c = await createClient(),
      r = await c.rpc("plaza_report_state", {
        p_page: Math.max(1, Math.min(100000, Number(params.reportPage) || 1)),
      });
    if (r.error) throw Error("광장 확인 요청을 읽지 못했어요.");
    plazaReports = r.data;
  }
  let classroomTools:ClassroomToolState|null=null;
  const toolsClass=data.selectedClassroom||data.classes[0]?.id;
  if(profile.role==='student'&&profile.consent_status==='verified'&&data.schemaReady&&toolsClass&&['today','reading'].includes(tab)){
    const c=await createClient(),r=await c.rpc('classroom_tool_state',{p_classroom:toolsClass,p_query:'',p_page:1});
    if(r.error)throw Error('간편 독서 기록을 읽지 못했어요. 연결을 확인해 주세요.');
    classroomTools=r.data as ClassroomToolState;
  }
  return (
    <>
      <LearningHub
        data={data}
        classroomTools={classroomTools}
        learningToken={learningToken}
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
      {plazaReports && <PlazaReports state={plazaReports} />}
    </>
  );
}
