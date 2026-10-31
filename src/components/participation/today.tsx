"use client";
import Link from "next/link";
import { BookOpen, Feather, Sprout } from "lucide-react";
import type { DashboardData } from "@/lib/data";
import type { HubData } from "@/lib/hub-data";
import { todayTasks } from "@/lib/today";
import { missionDisplayTitle } from "@/lib/participation";
const labels: Record<string, string> = {
  revision: "피드백 읽고 고쳐 쓰기",
  draft: "쓰던 글 이어쓰기",
  new: "내 생각 쓰기",
  waiting: "제출한 글·피드백 보기",
  completed: "완성한 작품 보기",
};
export function Today({ data, hub }: { data: DashboardData; hub: HubData }) {
  const teacher = data.profile.role === "teacher",
    tasks = todayTasks(data);
  const latest = data.submissions.filter(
    (s) =>
      !data.submissions.some(
        (n) =>
          n.assignment_id === s.assignment_id &&
          n.student_id === s.student_id &&
          n.version > s.version,
      ),
  );
  return (
    <div className="today-board">
      <div className="today-intro">
        <span className="eyebrow">ONE SMALL STEP TODAY</span>
        <h2>
          {teacher
            ? "오늘의 교실, 한눈에 준비해요"
            : "오늘은 어떤 생각을 남길까요?"}
        </h2>
        <p>
          {teacher
            ? "학급 준비와 학생의 새 기록을 이곳에서 이어가세요."
            : "한 가지 활동부터 골라 보세요. 쉬었다 돌아와도 쓰던 이야기에서 이어갈 수 있어요."}
        </p>
      </div>
      <div className="today-actions">
        {teacher ? (
          <>
            <Link href="/start">
              <Sprout size={28} />
              <strong>우리 반 시작하기</strong>
              <span>학급·계정·첫 미션·접속 안내</span>
            </Link>
            <Link href="/hub?tab=review">
              <Feather size={28} />
              <strong>학생 기록 확인</strong>
              <span>
                새 제출 {latest.filter((s) => s.status === "submitted").length}
                건 · 수정 기다림{" "}
                {latest.filter((s) => s.status === "revision_requested").length}
                건
              </span>
            </Link>
            <Link href="/hub?tab=packs">
              <BookOpen size={28} />
              <strong>수업 꾸러미 찾기</strong>
              <span>미션·피드백·공동 목표 함께 준비</span>
            </Link>
          </>
        ) : (
          <>
            <Link href="/hub?tab=reading#reading-editor">
              <BookOpen size={28} />
              <strong>책 읽고 기록하기</strong>
              <span>한 문장도 소중한 나의 생각</span>
            </Link>
            <Link
              href={
                tasks.find((t) =>
                  ["revision", "draft", "new"].includes(t.state),
                )
                  ? `/app/work/${tasks.find((t) => ["revision", "draft", "new"].includes(t.state))!.assignment.id}`
                  : "/app?view=missions"
              }
            >
              <Feather size={28} />
              <strong>오늘의 글쓰기</strong>
              <span>
                {tasks.find((t) =>
                  ["revision", "draft", "new"].includes(t.state),
                )
                  ? "선택한 미션에서 한 걸음 더"
                  : "배정받은 독서미션 살펴보기"}
              </span>
            </Link>
            <Link href="/hub?tab=growth">
              <Sprout size={28} />
              <strong>내 캐릭터와 우리 숲</strong>
              <span>나의 성장과 함께 이룬 목표</span>
            </Link>
          </>
        )}
      </div>
      {!data.classes.length && (
        <div className="notice">
          {teacher ? (
            <Link href="/start">
              첫 학급을 만들고 우리 반 책숲을 시작해 보세요.
            </Link>
          ) : (
            <Link href="/hub?tab=manage">
              연결된 학급이 없어요. 선생님께 학급 연결을 확인해 주세요.
            </Link>
          )}
        </div>
      )}
      {!teacher && (
        <section className="panel">
          <h2>나의 미션 이어가기</h2>
          {!tasks.length && (
            <p>
              아직 배정된 미션이 없어요. 오늘 읽은 책의 생각을 먼저 남겨도
              좋아요.
            </p>
          )}
          {tasks.slice(0, 8).map((t) => (
            <article className="today-task" key={t.assignment.id}>
              <div>
                <h3>{missionDisplayTitle(t.assignment)}</h3>
                <p>
                  {t.latest
                    ? `${t.latest.version}번째 글 · ${labels[t.state]}`
                    : labels[t.state]}
                  {t.draft && t.state === "draft"
                    ? " · 서버에 저장한 초안이 있어요"
                    : ""}
                </p>
              </div>
              <Link
                className="button button-outline"
                href={`/app/work/${t.assignment.id}`}
              >
                {labels[t.state]}
              </Link>
            </article>
          ))}
          {tasks.length > 8 && (
            <Link href="/app?view=missions">전체 미션 보기</Link>
          )}
        </section>
      )}
      {teacher && (
        <section className="panel">
          <h2>수업을 마친 뒤</h2>
          <div className="button-row">
            <Link className="button button-outline" href="/hub?tab=exhibitions">
              작은 작품 전시회
            </Link>
            <Link className="button button-outline" href="/hub?tab=economy">
              학급 역할·상점 확인
            </Link>
            <Link className="button button-outline" href="/hub?tab=exports">
              기록·작품집 내보내기
            </Link>
          </div>
          <p>
            독서 확인 대기는 ‘학생 기록 확인’에서 별도로 모아 보여 드립니다.
            기록 페이지는 최대 100건씩 확인할 수 있어요.
          </p>
        </section>
      )}
    </div>
  );
}
