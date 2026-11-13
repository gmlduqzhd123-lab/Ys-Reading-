"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { workshopSearch } from "@/app/classroom/workshop-actions";
import type { ClassroomToolState } from "@/lib/classroom-tools";
import type { WorkshopList, WorkshopRecord } from "@/lib/workshop-operations";
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
    [q, setQ] = useState(""),
    [kind, setKind] = useState("all"),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [data, setData] = useState<WorkshopList<WorkshopRecord> | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    request = useRef(0);
  const context = JSON.stringify({ selected, q, kind, from, until }),
    current = useRef(context);
  current.current = context;
  useEffect(() => {
    request.current++;
    setData(null);
    setBusy(false);
  }, [context]);
  useEffect(() => {
    if (action.blocked) {
      request.current++;
      setData(null);
      setBusy(false);
    }
  }, [action.blocked]);
  async function load(page = 1) {
    if (
      from &&
      until &&
      (from > until || (Date.parse(until) - Date.parse(from)) / 86400000 > 1096)
    ) {
      setMessage("시작일 이후의 종료일과 3년 이내의 기간을 선택해 주세요.");
      return;
    }
    const version = ++request.current,
      key = context;
    setBusy(true);
    setMessage("");
    setData(null);
    try {
      const r = await workshopSearch({
        owner,
        classroom: state.classroom.id,
        kind: "evidence",
        page,
        filters: { student: selected, q, status: kind, from, until },
      });
      if (version === request.current && key === current.current) setData(r);
    } catch {
      if (version === request.current)
        setMessage(
          "기록을 불러오지 못했어요. 연결과 검색 기간을 확인하고 다시 시도해 주세요.",
        );
    } finally {
      if (version === request.current) setBusy(false);
    }
  }
  return (
    <section className="panel" id={id}>
      <h2>기록에서 성장 근거 살펴보기</h2>
      <p>
        독서·글쓰기·활동지·종이 활동의 모든 보관 기록을 검색합니다. 참여 횟수와
        점수로 학습 성취를 자동 판정하지 않습니다.
      </p>
      <form
        className="tool-filter-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <fieldset
          className="hub-fieldset"
          disabled={busy || action.busy || action.blocked}
        >
          {!student && (
            <label className="field">
              근거를 살펴볼 학생
              <select
                aria-label="근거를 살펴볼 학생"
                required
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
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
          <label className="field">
            성장 근거 검색어
            <input
              maxLength={100}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="field">
            성장 근거 종류
            <select
              aria-label="성장 근거 종류"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">전체</option>
              <option value="reading">독서 기록</option>
              <option value="writing">글쓰기</option>
              <option value="answer">활동지·퀴즈</option>
              <option value="paper">종이 활동 관찰</option>
            </select>
          </label>
          <label className="field">
            성장 근거 시작일
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field">
            성장 근거 종료일
            <input
              type="date"
              min={from || undefined}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </label>
          <button disabled={!selected} className="button button-outline">
            독서·글쓰기·수업 활동 근거 불러오기
          </button>
        </fieldset>
      </form>
      <p role="status">{busy ? "기록을 확인하고 있어요." : message}</p>
      {data && !action.blocked && (
        <>
          <p>
            전체 {data.total}개 · {data.page}쪽 · 한 쪽에 {data.size}개
          </p>
          {!data.items.length && <p>검색 조건에 맞는 기록이 없어요.</p>}
          {data.items.map((r) => (
            <details className="tool-card" key={r.kind + ":" + r.id}>
              <summary>
                {r.kind === "answer"
                  ? r.title + " · " + r.version + "번째 제출"
                  : r.kind === "paper"
                    ? r.title + " · 종이 활동 · 교사 확인 기록"
                    : r.title +
                      " · " +
                      (r.kind === "reading"
                        ? "독서 기록"
                        : r.version + "번째 글")}
              </summary>
              <p>
                {r.created_at.slice(0, 10)} ·{" "}
                {r.status === "completed"
                  ? "확인 완료"
                  : r.status === "revision_requested"
                    ? "고쳐쓰기 요청"
                    : "기록·제출"}
              </p>
              <p className="tool-writing">{r.body}</p>
              {r.activity_id && (
                <Link href={"/classroom/activity/" + r.activity_id}>
                  배부 활동·제출 원기록 보기
                </Link>
              )}
            </details>
          ))}
          <nav className="button-row" aria-label="성장 근거 페이지">
            {data.page > 1 && (
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => void load(data.page - 1)}
              >
                성장 근거 이전
              </button>
            )}
            {data.page * data.size < data.total && (
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => void load(data.page + 1)}
              >
                성장 근거 다음
              </button>
            )}
          </nav>
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
