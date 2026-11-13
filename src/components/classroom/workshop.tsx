"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClassroomToolState } from "@/lib/classroom-tools";
import { QuickReading } from "./quick-reading";
import { ActivityEditor } from "./activity-editor";
import { ClassroomActivities } from "./activities";
import { ClassLibrary } from "./library";
import { Discoveries } from "./discoveries";
import { FamilyShare } from "./family-share";
import { ClassroomEvidence } from "./evidence";
import { useToolAction } from "./use-tool-action";
import { workshopHref, type WorkshopSection } from "@/lib/workshop-operations";
export function ClassroomWorkshop({
  owner,
  state,
  student,
  classes,
  page,
  query,
  aiReady = false,
  initialStudent,
  section = "today",
  params = {},
}: {
  owner: string;
  state: ClassroomToolState;
  student: boolean;
  classes: { id: string; name: string }[];
  page: number;
  query: string;
  aiReady?: boolean;
  initialStudent?: string;
  section?: WorkshopSection;
  params?: Record<string, string | undefined>;
}) {
  const router = useRouter(),
    action = useToolAction(owner, state.classroom.id),
    [mode, setMode] = useState(state.mode),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const dirty = () => !!document.querySelector('[data-tool-dirty="true"]');
    const unload = (e: BeforeUnloadEvent) => {
        if (dirty()) {
          e.preventDefault();
          e.returnValue = "";
        }
      },
      click = (e: MouseEvent) => {
        const a = e.target instanceof Element ? e.target.closest("a") : null;
        if (
          !a ||
          a.hasAttribute("download") ||
          e.defaultPrevented ||
          e.ctrlKey ||
          e.metaKey ||
          e.shiftKey
        )
          return;
        const target = new URL(a.href, location.href);
        if (
          target.pathname === location.pathname &&
          target.search === location.search
        )
          return;
        if (
          dirty() &&
          !window.confirm(
            "저장하지 않은 입력이 있어요. 다른 화면으로 이동할까요?",
          )
        )
          e.preventDefault();
      };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click);
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        !dirty()
      )
        router.refresh();
    }, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click);
    };
  }, [router]);
  const show = (name: WorkshopSection) => section === "all" || section === name;
  const href = (n: number) =>
    "/classroom?classroom=" +
    state.classroom.id +
    "&page=" +
    n +
    "&q=" +
    encodeURIComponent(query);
  if (action.blocked)
    return (
      <div className="notice" role="alert">
        계정이 바뀌었어요. 이 화면을 닫고 다시 로그인해 주세요.
      </div>
    );
  return (
    <div className="classroom-workshop">
      <span className="eyebrow">EVERYDAY READING CLASSROOM</span>
      <h1>{student ? "나의 책숲 탐험" : "우리 반 수업 공방"}</h1>
      <p>매일 읽고, 생각을 나누고, 나의 속도로 자라요.</p>
      <nav className="button-row" aria-label="수업 공방 학급 선택">
        {classes.map((c) => (
          <Link
            key={c.id}
            className="button button-outline"
            aria-current={c.id === state.classroom.id ? "page" : undefined}
            href={"/classroom?classroom=" + c.id}
          >
            {c.name}
          </Link>
        ))}
        <Link
          className="button button-outline"
          href={"/hub?tab=today&classroom=" + state.classroom.id}
        >
          나의 책숲으로
        </Link>
      </nav>
      {state.classroom.archived && (
        <p className="notice">
          보관된 학기입니다. 기록을 살펴보고 기존 보호자 공유를 해제할 수
          있어요.
        </p>
      )}
      <nav className="button-row" aria-label="수업 공방 도구">
        {(student
          ? [
              ["today", "오늘 할 일"],
              ["activities", "우리 반 활동"],
              ["discoveries", "리듬·도감"],
              ["library", "교실 도서"],
              ["evidence", "성장 근거"],
            ]
          : [
              ["today", "오늘의 활동 카드"],
              ["maker", "활동지 제작"],
              ["activities", "활동 확인"],
              ["library", "교실 도서"],
              ["evidence", "성장 근거"],
              ["family", "보호자 공유"],
              ["settings", "학급 기준·학생 시연"],
            ]
        ).map(([id, label]) => (
          <Link
            key={id}
            className="button button-outline"
            aria-current={section === id ? "page" : undefined}
            href={workshopHref(state.classroom.id, id)}
          >
            {label}
          </Link>
        ))}
      </nav>
      {student ? (
        show("today") ? (
          <>
            <QuickReading
              key={owner + state.classroom.id}
              owner={owner}
              state={state}
            />
            <section className="panel">
              <h2>이어서 할 우리 반 활동</h2>
              {state.activities
                .filter((a) => a.active)
                .slice(0, 3)
                .map((a) => (
                  <article className="tool-card" key={a.id}>
                    <h3>{a.snapshot.title}</h3>
                    <Link
                      className="button button-primary"
                      href={"/classroom/activity/" + a.id}
                    >
                      이 활동 이어 하기
                    </Link>
                  </article>
                ))}
              <Link href={workshopHref(state.classroom.id, "activities")}>
                우리 반 활동 전체 보기
              </Link>
            </section>
          </>
        ) : null
      ) : (
        <>
          {show("today") && (
            <section className="panel" id="today">
              <h2>오늘의 독서·활동 카드</h2>
              <p>
                한국 날짜 기준 새로 남긴 기록입니다. 기존 현황판·학생 기록
                확인함과 함께 사용하세요. 30초마다 새로 불러오며 입력 중이거나
                화면이 숨겨져 있으면 자동 갱신을 쉽니다.
              </p>
              <div className="button-row">
                <label className="field">
                  오늘 참여 구분
                  <select
                    disabled={action.busy || action.blocked}
                    aria-label="오늘 참여 구분"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">전체</option>
                    <option value="reading">독서 기록 있음</option>
                    <option value="activity">활동 제출 있음</option>
                    <option value="waiting">오늘 기록 없음</option>
                  </select>
                </label>
                <button
                  className="button button-outline"
                  onClick={() => location.reload()}
                >
                  오늘 카드 새로 불러오기
                </button>
              </div>
              <div className="tool-grid">
                {state.today
                  .filter((s) =>
                    filter === "reading"
                      ? s.readings > 0
                      : filter === "activity"
                        ? s.activities > 0
                        : filter === "waiting"
                          ? !s.readings && !s.activities
                          : true,
                  )
                  .map((s) => (
                    <article key={s.id} className="tool-card">
                      <h3>{s.name}</h3>
                      <p>
                        독서 {s.readings} · 활동 제출 {s.activities}
                      </p>
                      <button
                        className="button button-outline"
                        onClick={() => {
                          setSelected(s.id);
                          document
                            .getElementById("selected-records")
                            ?.scrollIntoView({
                              block: "start",
                              behavior: "auto",
                            });
                        }}
                      >
                        이 학생의 글·피드백 확인
                      </button>
                    </article>
                  ))}
              </div>
              <div id="selected-records">
                {selected && (
                  <ClassroomEvidence
                    id="selected-evidence"
                    key={selected}
                    owner={owner}
                    state={{
                      ...state,
                      today: state.today.filter((s) => s.id === selected),
                    }}
                    student={false}
                  />
                )}
              </div>
              <div className="button-row">
                <Link
                  className="button button-outline"
                  href={"/hub?tab=review&classroom=" + state.classroom.id}
                >
                  독서·글쓰기 확인함
                </Link>
                <Link
                  className="button button-outline"
                  href={"/hub?tab=overview&classroom=" + state.classroom.id}
                >
                  미제출·고쳐쓰기 현황
                </Link>
              </div>
            </section>
          )}
          {state.classroom.owner && (
            <>
              {show("settings") && (
                <section className="panel">
                  <h2>우리 반 기록 기준·학생 화면 시연</h2>
                  <form
                    className="hub-inline"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action.run("options_save", {
                        mode,
                        revision: state.optionsRevision,
                      });
                    }}
                  >
                    <label className="field">
                      간편 독서 기록 필수 항목
                      <select
                        disabled={action.busy || action.blocked}
                        aria-label="간편 독서 기록 필수 항목"
                        value={mode}
                        onChange={(e) => setMode(e.target.value as typeof mode)}
                      >
                        <option value="thought">나의 생각 한 줄</option>
                        <option value="quote">기억에 남는 구절</option>
                        <option value="both">구절과 나의 생각</option>
                      </select>
                    </label>
                    <button
                      className="button button-outline"
                      disabled={action.busy || state.classroom.archived}
                    >
                      학급 독서 기준 저장
                    </button>
                  </form>
                  <p role="status">{action.message}</p>
                  <details className="tool-preview">
                    <summary>이 학급의 학생 화면 수업 시연</summary>
                    <p>
                      가상 학생 ‘새싹’의 시연입니다. 실제 학생으로 로그인하거나
                      제출·보상을 변경하지 않습니다.
                    </p>
                    <h3>{state.classroom.name} · 새싹의 오늘</h3>
                    <p>
                      시작 화면:{" "}
                      {state.classroom.simple
                        ? "세 메뉴를 먼저 보는 간단 보기"
                        : "전체 메뉴 보기"}{" "}
                      · 작성 도움: {state.classroom.guidance}
                    </p>
                    <div className="button-row">
                      <span>오늘 할 일</span>
                      <span>나의 책장</span>
                      <span>캐릭터·배지</span>
                    </div>
                    <p>
                      독서 기록 기준:{" "}
                      {state.mode === "both"
                        ? "구절과 나의 생각"
                        : state.mode === "quote"
                          ? "기억에 남는 구절"
                          : "나의 생각 한 줄"}
                    </p>
                    {state.activities.map((a) => (
                      <article className="tool-card" key={a.id}>
                        <h4>{a.snapshot.title}</h4>
                        <p>{a.snapshot.instructions}</p>
                        {a.snapshot.questions.map((q) => (
                          <div key={q.id}>
                            <p>{q.label}</p>
                            {q.options?.map((o, i) => (
                              <p key={i}>○ {o}</p>
                            ))}
                          </div>
                        ))}
                      </article>
                    ))}
                    <Link href="/studio">
                      역할을 바꾸며 연습하는 별도 체험 교실
                    </Link>
                  </details>
                </section>
              )}
              {show("maker") && (
                <ActivityEditor
                  owner={owner}
                  state={state}
                  aiReady={aiReady}
                  params={params}
                />
              )}
            </>
          )}
        </>
      )}
      {show("activities") && (
        <ClassroomActivities
          owner={owner}
          state={state}
          student={student}
          params={params}
        />
      )}
      {student && show("discoveries") && (
        <Discoveries owner={owner} state={state} />
      )}
      {show("library") && (
        <ClassLibrary
          owner={owner}
          state={state}
          query={query}
          params={params}
        />
      )}
      {show("evidence") && (
        <ClassroomEvidence
          key={initialStudent ?? "selected"}
          initialStudent={initialStudent}
          owner={owner}
          state={state}
          student={student}
        />
      )}
      {state.classroom.owner && show("family") && (
        <FamilyShare owner={owner} state={state} params={params} />
      )}
      <p>
        <Link
          href={workshopHref(
            state.classroom.id,
            section === "all" ? "today" : "all",
          )}
        >
          {section === "all"
            ? "오늘 할 일로 간단히 보기"
            : "전체 도구 한 번에 보기"}
        </Link>
      </p>
    </div>
  );
}
