import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CollaborationState } from "@/lib/collaboration";
import type { ReviewState } from "@/lib/learning-queues";
import { CollaborationPanel } from "@/components/collaboration-panel";
import { ReviewQueue } from "@/components/participation/review-queue";
export const metadata = { title: "교사 협업·학교 운영" };
export default async function CollaborationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await requireProfile();
  if (p.role !== "teacher") redirect("/account");
  const params = await searchParams,
    c = await createClient(),
    page = Math.max(1, Math.min(100000, Math.trunc(Number(params.page)) || 1));
  const initial = await c.rpc("collaboration_state", {
    p_classroom: null,
    p_page: 1,
  });
  if (initial.error) throw Error("교사 협업 정보를 읽지 못했어요.");
  const base = initial.data as CollaborationState,
    selected =
      base.classes.find((x) => x.id === params.classroom)?.id ??
      base.classes[0]?.id ??
      null;
  const r = selected
    ? await c.rpc("collaboration_state", {
        p_classroom: selected,
        p_page: page,
      })
    : initial;
  if (r.error) throw Error("현재 담당 학급을 확인해 주세요.");
  const state = r.data as CollaborationState,
    cls = state.classes.find((x) => x.id === selected);
  let review: ReviewState | null = null;
  if (cls?.review) {
    const q = await c.rpc("review_queue_state", {
      p_classroom: cls.id,
      p_kind: params.reviewKind === "reading" ? "reading" : "writing",
      p_page: Math.max(1, Math.min(100000, Number(params.reviewPage) || 1)),
    });
    if (!q.error) review = q.data;
  }
  let records: {
    id: string;
    title: string;
    body: string;
    student_name: string;
  }[] = [];
  if (cls?.read) {
    const q = await c.rpc("collaboration_records", {
      p_classroom: cls.id,
      p_kind: params.kind === "writing" ? "writing" : "reading",
      p_page: page,
    });
    if (q.error) throw Error("기록을 읽지 못했어요.");
    records = q.data;
  }
  return (
    <div className="operations-page">
      <span className="eyebrow">TEACH TOGETHER</span>
      <h1>교사 협업·학교 운영</h1>
      <p>담당 범위와 맡은 권한에 맞춰 함께 운영합니다.</p>
      <form method="get">
        <label className="field">
          함께 운영할 학급
          <select name="classroom" defaultValue={selected ?? ""}>
            {state.classes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ·{" "}
                {x.owner
                  ? "담임"
                  : x.review
                    ? "검토 교사"
                    : x.students
                      ? "학생 계정 관리"
                      : "기록 읽기"}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-outline">학급 확인</button>
      </form>
      <CollaborationPanel state={state} classroom={selected} />
      {cls?.read && (
        <section className="panel">
          <h2>담당 학급 기록 읽기</h2>
          <div className="hub-inline">
            <Link
              href={"/collaboration?classroom=" + selected + "&kind=reading"}
            >
              독서 기록
            </Link>
            <Link
              href={"/collaboration?classroom=" + selected + "&kind=writing"}
            >
              제출 글
            </Link>
            <Link href={"/reports?classroom=" + selected}>성장 보고서</Link>
          </div>
          {records.map((x) => (
            <details className="search-record" key={x.id}>
              <summary>
                {x.student_name} · {x.title}
              </summary>
              <p className="submission-body">{x.body}</p>
            </details>
          ))}
          {!records.length && (
            <p>동의와 참여 상태가 확인된 기록이 아직 없어요.</p>
          )}
        </section>
      )}
      {review && (
        <ReviewQueue
          owner={p.id}
          state={review}
          classes={state.classes.filter((x) => x.review)}
          basePath="/collaboration?view=review"
        />
      )}
      <nav className="hub-inline" aria-label="협업 명단·기록 페이지">
        {page > 1 && (
          <Link
            href={
              "/collaboration?" +
              new URLSearchParams({
                ...params,
                classroom: selected ?? "",
                page: String(page - 1),
              } as Record<string, string>)
            }
          >
            이전 명단·기록
          </Link>
        )}
        <span>{page}페이지</span>
        {(page * 30 < state.total || records.length === 20) && (
          <Link
            href={
              "/collaboration?" +
              new URLSearchParams({
                ...params,
                classroom: selected ?? "",
                page: String(page + 1),
              } as Record<string, string>)
            }
          >
            다음 명단·기록
          </Link>
        )}
      </nav>
      <Link href="/hub">나의 책숲으로 →</Link>
    </div>
  );
}
