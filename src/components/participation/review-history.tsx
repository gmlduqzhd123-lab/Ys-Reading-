"use client";

import { useEffect, useId, useState } from "react";
import { formatOperationsDate } from "@/lib/operations";

type HistoryPage = {
  page: number;
  hasNext: boolean;
  submissions: {
    id: string;
    version: number;
    title: string;
    body: string;
    status: string;
    created_at: string;
    feedback: { id: string; body: string; decision: string; created_at: string }[];
  }[];
};
const statuses: Record<string, string> = {
  submitted: "확인 대기", revision_requested: "고쳐쓰기 요청", completed: "확인 완료",
};

export function ReviewHistory({ submission }: { submission: string }) {
  const region = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ data?: HistoryPage; error?: string }>();
  useEffect(() => {
    if (!open) return;
    const request = new AbortController();
    setResult(undefined);
    const query = new URLSearchParams({ submission, page: String(page) });
    void fetch("/api/review-history?" + query, { cache: "no-store", signal: request.signal })
      .then(async response => {
        const value = await response.json();
        if (!response.ok) return { error: value.error ?? "제출 이력을 읽지 못했어요." };
        return { data: value as HistoryPage };
      })
      .then(value => { if (!request.signal.aborted) setResult(value); })
      .catch(() => {
        if (!request.signal.aborted) setResult({ error: "연결을 확인하고 제출 이력을 다시 열어 주세요." });
      });
    return () => request.abort();
  }, [submission, open, page, attempt]);
  return <>
    <button type="button" className="button button-outline" aria-controls={region} aria-expanded={open}
      onClick={() => { setResult(undefined); setPage(1); setOpen(!open); }}>
      {open ? "제출 이력 닫기" : "제출 이력·이전 피드백 보기"}
    </button>
    <section id={region} aria-label="이 글의 제출 이력" hidden={!open}>
      {open && <>
        {!result && <p role="status">이 글의 제출 이력을 불러오는 중이에요.</p>}
        {result?.error && <>
          <p role="alert">{result.error}</p>
          <button type="button" className="button button-outline" onClick={() => setAttempt(value => value + 1)}>이력 다시 불러오기</button>
        </>}
        {result?.data?.submissions.map(item => (
          <article className="panel" key={item.id}>
            <h4>{item.version}번째 글 · {item.title}</h4>
            <p>{statuses[item.status] ?? item.status} · {formatOperationsDate(item.created_at)}</p>
            <p className="submission-body">{item.body}</p>
            {item.feedback.map(feedback => (
              <div key={feedback.id}>
                <p><strong>선생님 피드백</strong> · {formatOperationsDate(feedback.created_at)}</p>
                <p className="submission-body">{feedback.body}</p>
              </div>
            ))}
          </article>
        ))}
        {result?.data && <div className="button-row">
          {page > 1 && <button type="button" className="button button-outline" onClick={() => setPage(page - 1)}>이전 이력</button>}
          {!result.data.submissions.length && <p>표시할 제출 이력이 없어요.</p>}
          {result.data.hasNext && <button type="button" className="button button-outline" onClick={() => setPage(page + 1)}>다음 이력</button>}
        </div>}
      </>}
    </section>
  </>;
}
