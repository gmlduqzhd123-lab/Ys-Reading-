"use client";
import Link from "next/link";
import { BookOpen, Feather, Sprout } from "lucide-react";
import type { TodayState } from "@/lib/learning-queues";
import type { Classroom } from "@/lib/data";
import { hubHref, withClassroom } from "@/lib/hub-navigation";
const labels: Record<string, string> = {
  revision: "피드백 읽고 고쳐 쓰기",
  draft: "쓰던 글 이어쓰기",
  new: "내 생각 쓰기",
  waiting: "제출한 글·피드백 보기",
  completed: "완성한 작품 보기",
};
export function Today({
  state,
  classes,
  classroom,
}: {
  state: TodayState;
  classes: Classroom[];
  classroom: string;
}) {
  const active = classes.some((c) => c.term_state !== "archived"),
    next = state.page === 1
      ? state.nextTask === undefined
        ? state.tasks.find(t => ["revision", "draft", "new"].includes(t.state))
        : state.nextTask
      : null;
  const remaining = state.tasks.filter(t => t.id !== next?.id);
  const hasNext = state.page * (state.pageSize ?? 8) < state.total;
  return (
    <div className="today-board">
      <div className="today-intro">
        <span className="eyebrow">ONE SMALL STEP TODAY</span>
        <h2>오늘은 어떤 생각을 남길까요?</h2>
        <p>한 가지 활동부터 골라 보세요. 진행 중인 학급의 활동만 보여드려요.</p>
      </div>
      {next && (
        <section className="panel today-next" aria-labelledby="today-next-title">
          <div>
            <h2 id="today-next-title">지금 할 일</h2>
            <p className="today-next-name">{next.mission_snapshot.title}</p>
            <p>
              {[
                classes.find(c => c.id === next.classroom_id)?.name,
                next.due_at ? "마감 " + new Date(next.due_at).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul", month: "long", day: "numeric",
                }) : "마감일 없음",
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Link className="button button-primary" href={withClassroom(`/app/work/${next.id}`, classroom)}>
            {labels[next.state]}
          </Link>
        </section>
      )}
      <div className="today-actions">
        <Link
          href={withClassroom(active ? "/hub?tab=reading#reading-editor" : "/hub?tab=terms", classroom)}
        >
          <BookOpen size={28} />
          <strong>
            {active ? "책 읽고 기록하기" : "활동할 학급 확인하기"}
          </strong>
          <span>
            {active
              ? "한 문장도 소중한 나의 생각"
              : "새 학급 참여를 선생님과 확인해요"}
          </span>
        </Link>
        {!next && <Link
          href={
            active
                ? withClassroom("/app?view=missions", classroom)
                : hubHref("terms", classroom)
          }
        >
          <Feather size={28} />
          <strong>오늘의 글쓰기</strong>
          <span>
            {active
                ? "배정받은 독서미션 살펴보기"
                : "학급 참여 확인 후 시작해요"}
          </span>
        </Link>}
        <Link href={hubHref("growth", classroom)}>
          <Sprout size={28} />
          <strong>내 캐릭터와 우리 숲</strong>
          <span>나의 성장과 함께 이룬 목표</span>
        </Link>
      </div>
      {state.pendingClasses > 0 && (
        <p className="notice">
          새 학급 {state.pendingClasses}개의 참여 시작을 기다리고 있어요.{" "}
          <Link href="/hub?tab=terms">나의 학기에서 확인 →</Link>
        </p>
      )}
      {!active && (
        <p className="notice">
          지금 활동할 수 있는 학급이 없어요.{" "}
          <Link href={classes.length ? "/hub?tab=terms" : "/hub?tab=manage"}>
            {classes.length
              ? "지난 학기를 살펴보고 새 학급을 확인해 주세요."
              : "선생님과 학급 연결을 확인해 주세요."}
          </Link>
        </p>
      )}
      {(remaining.length > 0 || !next || hasNext) && <section className="panel">
        <h2>나의 미션 이어가기</h2>
        {!state.tasks.length && (
          <p>
            {state.total
              ? "이 페이지에 남은 활동이 없어요. 이전 묶음을 확인해 주세요."
              : active
                ? "아직 배정된 미션이 없어요. 오늘 읽은 책의 생각을 먼저 남겨도 좋아요."
                : "새 학급에 참여하면 배정된 미션을 볼 수 있어요."}
          </p>
        )}
        {remaining.map((t) => (
          <article className="today-task" key={t.id}>
            <div>
              <h3>{t.mission_snapshot.title}</h3>
              <p>
                {t.version ? `${t.version}번째 글 · ` : ""}
                {labels[t.state]}
                {t.state === "draft" ? " · 서버에 저장한 초안이 있어요" : ""}
              </p>
            </div>
            <Link className="button button-outline" href={withClassroom(`/app/work/${t.id}`, classroom)}>
              {labels[t.state]}
            </Link>
          </article>
        ))}
        <nav className="button-row" aria-label="오늘 할 일 페이지">
          {state.page > 1 && (
            <Link
              className="button button-outline"
              href={hubHref("today", classroom, { todayPage: state.page - 1 })}
            >
              이전 활동
            </Link>
          )}
          <span>
            전체 {state.total}개 · {state.page}페이지
          </span>
          {hasNext && (
            <Link
              className="button button-outline"
              href={hubHref("today", classroom, { todayPage: state.page + 1 })}
            >
              다음 활동
            </Link>
          )}
        </nav>
      </section>}
      {classes.some((c) => c.term_state === "archived") && (
        <p>
          <Link href={hubHref("search", classroom)}>
            지난 학기의 글과 독서 기록 찾아보기 →
          </Link>
        </p>
      )}
    </div>
  );
}
