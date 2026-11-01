"use client";
import Link from "next/link";
import { useState } from "react";
import {
  recordLabels,
  recordStatus,
  searchHref,
  type SearchFilters,
  type SearchResult,
} from "@/lib/classroom-insights";
import type { Classroom } from "@/lib/data";
export function RecordSearch({
  data,
  filters,
  classes,
  teacher,
  error,
}: {
  data: SearchResult | null;
  filters: SearchFilters;
  classes: Classroom[];
  teacher: boolean;
  error?: string;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState("");
  async function download(kind: string, id: string) {
    setBusy(id);
    setMessage("");
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: kind === "draft" ? "drafts" : kind,
          ids: [id],
          format: "docx",
          requestId: crypto.randomUUID(),
          title: "책숲 · 선택한 기록",
        }),
      });
      if (!r.ok) throw Error((await r.json()).error ?? "저장하지 못했어요.");
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = "책숲-검색기록.docx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMessage("선택한 기록의 Word 사본을 저장했어요.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "연결을 확인해 주세요.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="insights-page">
      <h2>기록 검색</h2>
      <p>
        {teacher
          ? "담당 학급의 독서·제출 버전을"
          : "나의 독서·초안·제출 버전을"}
        날짜·상태·검색어로 찾습니다. 검색어는 제목·본문·책 정보·학생 표시 이름에
        포함된 글자를 그대로 찾습니다.
      </p>
      {teacher && (
        <p className="form-help">
          제출 전 학생 초안은 학생 본인만 볼 수 있어요.
        </p>
      )}
      <form action="/hub" className="record-filters">
        <input type="hidden" name="tab" value="search" />
        <label className="field">
          기록 종류
          <select name="kind" defaultValue={filters.kind}>
            <option value="">모두</option>
            <option value="reading">독서 기록</option>
            <option value="writing">제출한 글 · 모든 버전</option>
            {!teacher && <option value="draft">작성 중인 초안</option>}
          </select>
        </label>
        <label className="field">
          학급
          <select name="classroom" defaultValue={filters.classroom}>
            <option value="">접근 가능한 모든 학급</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          검색어
          <input
            name="q"
            defaultValue={filters.q}
            maxLength={100}
            placeholder="책·글 제목, 문장, 학생 이름"
          />
        </label>
        <label className="field">
          시작 날짜
          <input name="from" type="date" defaultValue={filters.from} />
        </label>
        <label className="field">
          끝 날짜
          <input name="to" type="date" defaultValue={filters.to} />
        </label>
        <label className="field">
          상태
          <select name="status" defaultValue={filters.status}>
            <option value="">모든 상태</option>
            {Object.entries(recordStatus).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {filters.student && (
          <label className="field">
            선택된 학생
            <input type="hidden" name="student" value={filters.student} />
            <span>현황판에서 선택한 학생의 기록만 표시 중</span>
            <Link href={searchHref(filters, { student: "", page: 1 })}>
              학생 조건 해제
            </Link>
          </label>
        )}
        <div className="button-row">
          <button className="button button-primary">기록 찾기</button>
          <Link className="button button-outline" href="/hub?tab=search">
            조건 초기화
          </Link>
        </div>
      </form>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {data && (
        <>
          <p role="status">
            전체 {data.total}건 · {data.page}페이지 · 한 페이지 25건
          </p>
          {!data.rows.length && (
            <p className="hub-empty">
              이 조건에 맞는 기록이 없어요. 날짜와 검색어를 바꿔 보세요.
            </p>
          )}
          {data.rows.map((r) => (
            <article className="panel search-record" key={r.kind + r.id}>
              <small>
                {recordLabels[r.kind]} · {r.recorded_on} ·{" "}
                {recordStatus[r.status]} · {r.version}
                {r.kind === "writing" ? "번째 글" : "번째 저장"}
              </small>
              <h3>{r.title || "제목 없는 초안"}</h3>
              <p>
                {teacher ? r.student_name + " · " : ""}
                {classes.find((c) => c.id === r.classroom_id)?.name} ·{" "}
                {r.activity}
              </p>
              <details>
                <summary>기록 펼쳐 읽기</summary>
                <p className="submission-body">
                  {r.body || "아직 내용이 없어요."}
                </p>
                {r.question && (
                  <p className="submission-body">질문: {r.question}</p>
                )}
              </details>
              <div className="button-row">
                <button
                  disabled={!!busy}
                  className="button button-outline"
                  onClick={() => void download(r.kind, r.id)}
                >
                  Word 사본 저장
                </button>
                {r.assignment_id && (
                  <Link
                    className="text-link"
                    href={
                      teacher
                        ? "/hub?tab=review"
                        : `/app/work/${r.assignment_id}`
                    }
                  >
                    {teacher ? "교사 확인함" : "미션·피드백 보기"} →
                  </Link>
                )}
              </div>
            </article>
          ))}
          <nav className="hub-row" aria-label="검색 결과 페이지">
            {data.page > 1 && (
              <Link
                className="button button-outline"
                href={searchHref(filters, { page: data.page - 1 })}
              >
                이전 결과
              </Link>
            )}
            <span>{data.total}건</span>
            {data.page * data.pageSize < data.total && (
              <Link
                className="button button-outline"
                href={searchHref(filters, { page: data.page + 1 })}
              >
                다음 결과
              </Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
