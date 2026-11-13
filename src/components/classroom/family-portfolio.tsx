"use client";
import { useEffect, useRef, useState } from "react";
import { formatOperationsDate } from "@/lib/operations";
interface Portfolio {
  title: string;
  teacherNote: string;
  version: number;
  createdAt: string;
  from: string | null;
  until: string | null;
  works: { title: string; body: string; version: number }[];
}
export function FamilyPortfolio() {
  const [data, setData] = useState<Portfolio | null>(null),
    [message, setMessage] = useState("공유된 기록을 확인하고 있어요."),
    [busy, setBusy] = useState(true),
    token = useRef("");
  async function read(signal?: AbortSignal) {
    try {
      const r = await fetch("/api/family", {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.current }),
        signal,
      });
      if (!r.ok)
        throw Error(
          r.status === 429 || r.status === 503 ? "RETRY" : "UNAVAILABLE",
        );
      const v = await r.json();
      if (!signal?.aborted) {
        setData(v);
        setMessage("");
      }
    } catch (error) {
      if (!signal?.aborted) {
        setData(null);
        setMessage(
          error instanceof Error && error.message === "UNAVAILABLE"
            ? "공유 기간이 끝났거나 해제된 링크입니다. 담당 선생님에게 새 링크를 요청해 주세요."
            : "연결을 확인하지 못했어요. 잠시 후 공유 상태를 다시 확인해 주세요.",
        );
      }
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    token.current ||= location.hash.slice(1);
    history.replaceState(null, "", location.pathname);
    if (!/^[a-f0-9]{64}$/.test(token.current)) {
      setMessage("유효한 보호자 공유 링크로 열어 주세요.");
      setBusy(false);
      return;
    }
    const c = new AbortController();
    void read(c.signal);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void read(c.signal);
    }, 30000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, []);
  return (
    <section className="panel family-portfolio">
      <span className="eyebrow">A GROWING STORY</span>
      <h1>가족과 나누는 성장 기록</h1>
      <p>
        선생님이 확인한 보고서 한 판을 읽기 전용으로 보여 드립니다. 화면의
        내용을 다른 곳에 공개하지 말아 주세요.
      </p>
      <p role="status">{busy ? "기록을 확인하고 있어요." : message}</p>
      {!busy && token.current && (
        <button
          className="button button-outline"
          onClick={() => {
            setBusy(true);
            void read();
          }}
        >
          공유 상태 다시 확인
        </button>
      )}
      {data && (
        <>
          <h2>{data.title}</h2>
          <p>
            {data.version}판 · 작성 {formatOperationsDate(data.createdAt)}
          </p>
          <h3>선생님의 관찰과 응원</h3>
          <p className="tool-writing">{data.teacherNote}</p>
          {data.works.map((w, i) => (
            <article className="tool-card" key={i}>
              <h3>
                {w.title} · {w.version}번째 글
              </h3>
              <p className="tool-writing">{w.body}</p>
            </article>
          ))}
          <p>
            공유 상태는 화면을 보는 동안 30초마다 다시 확인합니다. 이미 읽거나
            별도로 저장한 내용까지 회수되지는 않습니다.
          </p>
        </>
      )}
    </section>
  );
}
