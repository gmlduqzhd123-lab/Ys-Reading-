"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Bookshelf, LinkedReadingRecord } from "./bookshelf";
import {StudentViewSettings} from "./student-view-settings";
import { Character, Economy } from "./growth-economy";
import { Management, Plaza } from "./community";
import { Exports } from "./exports";
import { PaperGrowth } from "./paper-growth";
import { ArrowRight, PenLine } from "lucide-react";
import type { HubData } from "@/lib/hub-data";
import { readingScrollBehavior } from "@/lib/hub";
import type { TodayState, ReviewState } from "@/lib/learning-queues";
import type { ParticipationData } from "@/lib/participation";
import { Today } from "@/components/participation/today";
import { ReviewQueue } from "@/components/participation/review-queue";
import { SharedForest } from "@/components/participation/shared-forest";
import { EconomyLab } from "@/components/participation/economy-lab";
import { Exhibitions } from "@/components/participation/exhibitions";
import { LessonPacks } from "@/components/participation/lesson-packs";
import { RefreshButton } from "@/components/participation/refresh-button";
import { ClassOverviewPanel } from "@/components/participation/class-overview";
import { RecordSearch } from "@/components/participation/record-search";
import type {
  ClassOverview,
  SearchFilters,
  SearchResult,
} from "@/lib/classroom-insights";
import type { GrowthState, TermState } from "@/lib/growth-terms";
import { TermPanel } from "./term-panel";
import { HandoverPanel, type HandoverState } from "./operations-batch";
import {ClassContext} from "./class-context";
import {LearningUpdates} from "./learning-updates";
import {hubHref, hubTabPermission, withClassroom} from "@/lib/hub-navigation";
import type {ClassroomToolState} from '@/lib/classroom-tools';
import { QuickReading, QuickReadingClassChoice } from "@/components/classroom/quick-reading";

const tabGroups = [
  { label: "수업·기록", tabs: ["overview", "packs", "search", "reading", "exports"] },
  { label: "작품·성장", tabs: ["growth", "plaza", "exhibitions", "economy"] },
  { label: "학급·학기", tabs: ["manage", "terms"] },
];
export function LearningHub({
  data,
  classroomTools,
  learningToken,
  initialTab,
  google,
  googleNotice,
  linkedRecord,
  editLinkedRecord,
  participation,
  studentToday,
  reviewQueue,
  handovers,
  overview,
  search,
  filters,
  searchError,
  growth,
  terms,
}: {
  data: HubData;
  classroomTools?:ClassroomToolState|null;
  learningToken?:string;
  initialTab?: string;
  google: { configured: boolean; connected: boolean };
  googleNotice?: string;
  linkedRecord?: string;
  editLinkedRecord?: boolean;
  participation?: ParticipationData | null;
  studentToday?: TodayState | null;
  reviewQueue?: ReviewState | null;
  handovers?: HandoverState | null;
  overview?: ClassOverview | null;
  search?: SearchResult | null;
  filters: SearchFilters;
  searchError?: string;
  growth?: GrowthState | null;
  terms?: TermState | null;
}) {
  const teacher = data.profile.role === "teacher";
  const activeStaff = data.staffClasses?.filter(c => !data.selectedClassroom || c.id === data.selectedClassroom);
  const owns = teacher && (activeStaff?.some((c) => c.owner) ?? true);
  const canRead = !teacher || (activeStaff?.some((c) => c.read) ?? true);
  const canReview =
    teacher && (activeStaff?.some((c) => c.review) ?? true);
  const tabs = [
    ["today", teacher ? "오늘의 교실" : "오늘 할 일"],
    ...(teacher
      ? [
          ...(canRead ? [["overview", "현황·알림"]] : []),
          ...(canReview ? [["review", "학생 기록 확인"]] : []),
          ...(owns ? [["packs", "수업 꾸러미"]] : []),
        ]
      : []),
    ...(canRead
      ? [
          ["search", "기록 검색"],
          ["reading", "나의 책장"],
          ["exports", "기록·글 내보내기"],
        ]
      : []),
    ...(!teacher || owns
      ? [
          ["growth", "캐릭터·배지"],
          ["plaza", "학급 광장"],
          ["exhibitions", "작은 작품 전시회"],
          ["economy", "경제 교실"],
          ["manage", teacher ? "학급 관리" : "학급 연결"],
          ["terms", teacher ? "학기 종료·진급" : "나의 학기"],
        ]
      : []),
  ];
  const tab = tabs.some(([id]) => id === initialTab) ? initialTab! : "today";
  const quickReadingClasses = !teacher && !data.selectedClassroom
    ? data.classes.filter(classroom => classroom.term_state !== "archived")
    : [];
  const quickReading = classroomTools ? (
    <QuickReading key={data.profile.id + ":" + classroomTools.classroom.id} owner={data.profile.id} state={classroomTools} />
  ) : (tab === "today" || tab === "reading") && !linkedRecord && quickReadingClasses.length > 1 ? (
    <QuickReadingClassChoice classes={quickReadingClasses} tab={tab} />
  ) : null;
  const simple=!teacher&&data.classes.length===1&&data.classes[0].simple_student_view===true;
  const primaryIds = teacher ? ["today", "review", "manage"] : ["today", "reading"];
  const primaryTabs = primaryIds.flatMap(id => tabs.filter(([tabId]) => id === tabId));
  const otherTabs = tabs.filter(([id]) => !primaryIds.includes(id));
  const permission = teacher ? hubTabPermission(tab) : undefined;
  const unavailable = permission
    ? (data.availableClasses ?? []).filter(cls => !data.staffClasses?.some(c => c.id === cls.id && c[permission])).map(cls => cls.id)
    : [];
  if (teacher && data.staffClasses) {
    const permitted = new Set(
      data.staffClasses
        .filter((c) =>
          c[permission ?? "read"],
        )
        .map((c) => c.id),
    );
    data = {
      ...data,
      classes: data.classes.filter((c) => permitted.has(c.id)),
    };
  }
  useEffect(() => {
    const guard = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = e.target instanceof Element ? e.target.closest("a") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (
        document.querySelector('form[data-hub-dirty="true"]') &&
        !window.confirm(
          "아직 저장하지 않은 입력이 있어요. 입력을 남겨두려면 취소하고 먼저 저장해 주세요. 이동할까요?",
        )
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, []);
  return (
    <div className={simple ? "learning-hub simple-view" : "learning-hub"}>
      <div className="paper-breadcrumb">
        <Link href="/">나의 책숲</Link>
        <span>/</span>
        {tabs.find(([id]) => id === tab)?.[1]}
      </div>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">MY READING JOURNAL</span>
          <h1>
            {teacher ? "함께 읽고, 함께 자라는 교실." : "읽은 만큼, 자라는 나."}
          </h1>
          <p>
            {teacher
              ? "작은 생각을 발견하고, 다음 문장을 응원해 주세요."
              : `${data.profile.display_name} 님, 오늘의 한 문장을 책숲에 남겨 보세요.`}
          </p>
        </div>
        <div className="button-row">
          {teacher && (
            <Link className="button button-primary" href="/start?mode=new">
              학급 개설
            </Link>
          )}
          <RefreshButton />
          {teacher && (
            <Link className="button button-outline" href={withClassroom("/collaboration", data.selectedClassroom)}>
              교사 협업·학교 운영
            </Link>
          )}
          {!teacher &&
            tab === "reading" && !linkedRecord &&
            data.profile.consent_status === "verified" && (
              <button
                className="button button-primary"
                onClick={() => {
                  const editor = document.getElementById("reading-editor");
                  if (editor instanceof HTMLDetailsElement) {
                    editor.open = true;
                    editor.scrollIntoView({
                      behavior: readingScrollBehavior(),
                      block: "start",
                    });
                  }
                }}
              >
                <PenLine size={16} />
                독서 기록 쓰기
              </button>
            )}
          {teacher && (activeStaff?.some(c => c.students || c.owner) || data.profile.operator) && (
            <Link className="button button-outline" href={data.selectedClassroom ? "/operations?classroom=" + data.selectedClassroom : "/operations"}>
              학생 계정·기록 관리 <ArrowRight size={15} />
            </Link>
          )}
        </div>
      </div>
      <div className="workspace-menu">
        {!!data.availableClasses?.length && <ClassContext owner={data.profile.id} tab={tab}
          selected={data.selectedClassroom ?? ""} classes={data.availableClasses} unavailable={unavailable} />}
        <nav className="workspace-tabs" aria-label="교실 바로가기">
          {primaryTabs.map(([id, label]) => (
            <Link key={id} className={`hub-tab ${tab === id ? "selected" : ""}`}
              aria-current={tab === id ? "page" : undefined} href={hubHref(id, data.selectedClassroom)} prefetch={false}>
              {label}
            </Link>
          ))}
          {!teacher && <Link className="hub-tab" href={withClassroom("/app?view=feedback", data.selectedClassroom)} prefetch={false}>받은 피드백</Link>}
        </nav>
        <details className="workspace-more" key={tab + ":" + data.selectedClassroom}
          open={otherTabs.some(([id]) => id === tab) || undefined}>
          <summary>더 많은 활동 보기</summary>
          <nav className="workspace-nav-groups" aria-label="추가 책숲 활동">
            {tabGroups.map(({ label, tabs: groupTabs }, index) => {
              const links = otherTabs.filter(([id]) => groupTabs.includes(id));
              if (index === 2 && !links.length) return null;
              return (
                <div className="workspace-nav-group" key={label}>
                  <strong>{label}</strong>
                  <div className="workspace-tabs">
                    {index === 0 && <Link className="hub-tab" href={data.selectedClassroom ? "/classroom?classroom=" + data.selectedClassroom : "/classroom"}>
                      {teacher ? "우리 반 수업 공방 · 학생 화면 시연" : "우리 반 활동·책숲 도감"}
                    </Link>}
                    {index === 0 && <Link className="hub-tab" href="/missions">독서미션</Link>}
                    {index === 1 && <Link className="hub-tab" href={withClassroom("/app?view=contests", data.selectedClassroom)}>글쓰기 활동</Link>}
                    {index === 1 && canRead && <Link className="hub-tab" href={withClassroom("/reports", data.selectedClassroom)}>학기 성장 보고서</Link>}
                    {links.map(([id, name]) => (
                      <Link key={id} className={`hub-tab ${tab === id ? "selected" : ""}`}
                        aria-current={tab === id ? "page" : undefined} href={hubHref(id, data.selectedClassroom)} prefetch={false}>
                        {name}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        </details>
      </div>
      <LearningUpdates owner={data.profile.id} classroom={data.selectedClassroom??""} tab={tab} initialToken={learningToken}/>
      {!data.schemaReady ? (
        <div className="notice">
          <strong>새 교실 기능 연결을 준비하고 있어요.</strong> 기록·성장·경제
          교실을 사용할 데이터베이스 구성이 필요합니다. 기존 독서미션과 놀이터는
          계속 이용할 수 있어요.
        </div>
      ) : (
        <>
          {data.truncated.length > 0 && (
            <div className="notice">
              학급 참고 목록이 많아 일부가 표시되지 않습니다. 운영자에게 학급별
              조회 설정을 문의해 주세요.
            </div>
          )}
          {data.classes.some((c) => c.term_state === "archived") &&
            tab !== "terms" && (
              <p className="notice">
                보관된 학급의 기록은 조회·내보내기로 이어집니다. 새 활동은 진행
                중인 학급에서 시작해 주세요.{" "}
                <Link href="/hub?tab=terms">학기 상태 확인 →</Link>
              </p>
            )}
          {data.profile.role === "student" &&
          data.profile.consent_status !== "verified" &&
          tab !== "terms" ? (
            <>
              <div className="notice">
                참여 동의 확인을 기다리고 있어요. 동의 확인 전에는
                독서·공유·보상·구매 기능을 이용할 수 없습니다.
              </div>
              <Management data={data} />
            </>
          ) : (
            <>
              {tab === "today" && studentToday && (
                <Today state={studentToday} classes={data.classes} classroom={data.selectedClassroom ?? ""} />
              )}
              {tab === "today" && quickReading}
              {teacher && ["today", "overview"].includes(tab) && overview && (
                <ClassOverviewPanel
                  owns={owns}
                  canReview={canReview}
                  key={filters.classroom + ":" + filters.page}
                  data={overview}
                  classroom={filters.classroom}
                />
              )}
              {tab === "search" && (
                <RecordSearch
                  key={JSON.stringify(filters)}
                  data={search ?? null}
                  filters={filters}
                  error={searchError}
                  classes={data.classes}
                  teacher={teacher}
                />
              )}
              {tab === "review" && teacher && reviewQueue && (
                <ReviewQueue
                  owner={data.profile.id}
                  key={`${reviewQueue.kind}:${reviewQueue.classroom}:${reviewQueue.page}`}
                  state={reviewQueue}
                  classes={data.classes}
                  showClassFilter={false}
                />
              )}
              {tab === "packs" && teacher && participation && (
                <LessonPacks hub={data} extra={participation} />
              )}
              {tab === "exhibitions" && participation && (
                <Exhibitions hub={data} extra={participation} google={google} />
              )}
              {tab === "reading" && linkedRecord && (
                <LinkedReadingRecord key={linkedRecord + ":" + editLinkedRecord} data={data} id={linkedRecord} initiallyEditing={editLinkedRecord} />
              )}
              {tab === "reading" && !linkedRecord && (
                <div className="paper-dashboard">
                  <div className="paper-main">
                    {quickReading}
                    <Bookshelf key={data.selectedClassroom ?? ""} data={data} />
                  </div>
                  <PaperGrowth data={data} growth={growth} />
                </div>
              )}
              {tab === "exports" && (
                <Exports
                  key={`${data.profile.id}:${data.selectedClassroom ?? ""}`}
                  data={data}
                  google={google}
                  googleNotice={googleNotice}
                />
              )}
              {tab === "growth" && (
                <>
                  <Character data={data} growth={growth} />
                  {participation && (
                    <SharedForest hub={data} extra={participation} />
                  )}
                </>
              )}
              {tab === "terms" && terms && (
                <TermPanel
                  key={`${terms.selected}:${terms.rosterPage}`}
                  state={terms}
                  teacher={teacher}
                />
              )}
              {tab === "terms" && handovers && (
                <HandoverPanel
                  state={handovers}
                  classes={data.classes.filter(
                    (c) => c.term_state !== "archived",
                  )}
                />
              )}
              {tab === "plaza" && <Plaza data={data} />}
              {tab === "economy" && (
                <>
                  {participation && (
                    <EconomyLab hub={data} extra={participation} />
                  )}
                  <Economy data={data} />
                </>
              )}
              {tab === "manage" && <>{teacher&&owns&&<StudentViewSettings owner={data.profile.id} classes={data.classes.filter(c=>c.teacher_id===data.profile.id)}/>}<Management data={data} /></>}
              {!teacher && !data.classes.length && tab !== "manage" && (
                <Management data={data} />
              )}
              {![
                "today",
                "packs",
                "overview",
                "search",
                "exports",
                "terms",
                "review",
              ].includes(tab) && (
                <nav className="hub-row" aria-label="기록 페이지">
                  {data.page > 1 && (
                    <Link
                      className="button button-outline"
                      href={hubHref(tab,data.selectedClassroom,{page:data.page-1})}
                    >
                      이전 기록
                    </Link>
                  )}
                  <p>
                    {data.page}페이지 · 목록별 최대 100개 · 경험치·지갑은 전체
                    기록 기준
                  </p>
                  {data.hasNext && (
                    <Link
                      className="button button-outline"
                      href={hubHref(tab,data.selectedClassroom,{page:data.page+1})}
                    >
                      다음 기록
                    </Link>
                  )}
                </nav>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
