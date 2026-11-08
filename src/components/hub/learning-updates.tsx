"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
export function LearningUpdates({
  owner,
  classroom,
  tab,
}: {
  owner: string;
  classroom: string;
  tab: string;
}) {
  const [changed, setChanged] = useState(false),
    [message, setMessage] = useState(""),
    [busy, start] = useTransition(),
    router = useRouter();
  useEffect(() => {
    let stopped = false,
      inFlight = false,
      baseline = "",
      timer: ReturnType<typeof setTimeout>,
      failures = 0,
      request: AbortController | null = null;
    setChanged(false);
    setMessage("");
    const poll = async () => {
      if (stopped || inFlight) return;
      clearTimeout(timer);
      if (document.hidden || !navigator.onLine) {
        timer = setTimeout(poll, 60000);
        return;
      }
      inFlight = true;
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const r = await fetch(
          "/api/learning-changes?classroom=" + encodeURIComponent(classroom),
          {
            headers: { "X-Bookforest-Actor": owner },
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (r.status === 401) {
          stopped = true;
          return;
        }
        if (!r.ok) throw Error();
        const d = await r.json();
        if (typeof d.token !== "string") throw Error();
        if (!stopped) {
          if (baseline && baseline !== d.token) setChanged(true);
          baseline = d.token;
          failures = 0;
        }
      } catch {
        failures = Math.min(4, failures + 1);
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (!stopped)
          timer = setTimeout(poll, Math.min(300000, 60000 * 2 ** failures));
      }
    };
    const resume = () => {
      if (!document.hidden) void poll();
    };
    void poll();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      request?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [owner, classroom, tab]);
  if (!changed) return null;
  return (
    <aside className="notice" role="status">
      <p>새 기록·제출·피드백이 있어요. 현재 입력은 그대로 두고 있습니다.</p>
      <button
        className="button button-outline"
        disabled={busy}
        onClick={() => {
          if (
            document.querySelector(
              '[data-hub-dirty="true"], [data-draft-dirty="true"]',
            )
          ) {
            setMessage(
              "작성 중인 내용을 먼저 저장한 뒤 새 활동을 불러와 주세요.",
            );
            return;
          }
          start(() => {
            router.refresh();
            setChanged(false);
            setMessage("");
          });
        }}
      >
        새 활동 불러오기
      </button>
      {message && <p>{message}</p>}
    </aside>
  );
}
