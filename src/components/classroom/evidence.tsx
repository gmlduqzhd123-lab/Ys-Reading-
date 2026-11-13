"use client";
import { useState } from "react";
import Link from "next/link";
import { classroomEvidence } from "@/app/classroom/actions";
import type { ClassroomToolState, Evidence } from "@/lib/classroom-tools";
import { useToolAction } from "./use-tool-action";
export function ClassroomEvidence({
  owner,
  state,
  student,
  id = "evidence",
  initialStudent,
}: {
  owner: string;
  state: ClassroomToolState;
  student: boolean;
  id?: string;
  initialStudent?: string;
}) {
  const action = useToolAction(owner, state.classroom.id),
    [selected, setSelected] = useState(
      student ? owner : (initialStudent ?? state.today[0]?.id ?? ""),
    ),
    [data, setData] = useState<Evidence | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="panel" id={id}>
      <h2>기록에서 성장 근거 살펴보기</h2>
      <p>
        독서·글쓰기·활동지의 기록과 버전을 함께 봅니다. 참여 횟수와 점수만으로
        학습 성취를 자동 판정하지 않습니다. 각 종류 최근 20개를 표시합니다.
      </p>
      <form
        className="hub-inline"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setData(null);
          const r = await classroomEvidence({
            owner,
            classroom: state.classroom.id,
            student: selected,
          });
          if (r.ok) setData(r.data);
          else setMessage(r.message);
          setBusy(false);
        }}
      >
        {!student && (
          <label className="field">
            근거를 살펴볼 학생
            <select
              required
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setData(null);
              }}
            >
              <option value="">학생 선택</option>
              {state.today.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          disabled={busy || action.blocked || !selected}
          className="button button-outline"
        >
          독서·글쓰기·수업 활동 근거 불러오기
        </button>
      </form>
      <p role="status">{message}</p>
      {data && !action.blocked && (
        <>
          <h3>독서 기록</h3>
          {data.readings.map((r) => (
            <details className="tool-card" key={r.id}>
              <summary>
                {r.read_on} · {r.title} ·{" "}
                {r.verified_at ? "교사 확인" : "확인 대기"}
              </summary>
              <p className="tool-writing">{r.thought}</p>
              <Link
                href={
                  "/hub?tab=reading&classroom=" +
                  state.classroom.id +
                  "#reading-" +
                  r.id
                }
              >
                독서 원기록 열기
              </Link>
            </details>
          ))}
          <h3>제출한 글·고쳐쓰기</h3>
          {data.writing.map((w) => (
            <details className="tool-card" key={w.id}>
              <summary>
                {w.title} · {w.version}번째 글 ·{" "}
                {w.status === "completed"
                  ? "확인 완료"
                  : w.status === "revision_requested"
                    ? "고쳐쓰기 요청"
                    : "제출"}
              </summary>
              <p className="tool-writing">{w.body}</p>
              <Link href={"/app/work/" + w.assignment_id}>
                이 글의 제출·피드백 원기록 열기
              </Link>
            </details>
          ))}
          <h3>활동지·퀴즈 제출 버전</h3>
          {(data.papers ?? []).map((p) => (
            <details className="tool-card" key={p.activity_id}>
              <summary>{p.title} · 종이 활동 · 교사 확인 기록</summary>
              <p>{p.note}</p>
              <Link href={"/classroom/activity/" + p.activity_id}>
                배부 원기록 보기
              </Link>
            </details>
          ))}
          {data.activities.map((a) => (
            <details className="tool-card" key={a.id}>
              <summary>
                {a.title} · {a.version}번째 제출
              </summary>
              {Object.entries(a.answers).map(([q, v]) => (
                <p key={q}>
                  {q}: {typeof v === "number" ? "선택지 " + (v + 1) : v}
                </p>
              ))}
              <p>교사 피드백: {a.feedback || "확인 대기"}</p>
              <Link href={"/classroom/activity/" + a.activity_id}>
                배부 활동·제출 원기록 보기
              </Link>
            </details>
          ))}
          {!student && (
            <Link
              className="button button-primary"
              href={
                "/reports?classroom=" +
                state.classroom.id +
                "&student=" +
                selected
              }
            >
              이 학생의 성장 보고서 준비
            </Link>
          )}
        </>
      )}
    </section>
  );
}
