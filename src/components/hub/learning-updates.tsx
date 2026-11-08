"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { learningPoller } from "@/lib/learning-polling";
export function LearningUpdates({
  owner,
  classroom,
  tab,
  initialToken = "",
}: {
  owner: string;
  classroom: string;
  tab: string;
  initialToken?: string;
}) {
  const [changed, setChanged] = useState(false),
    [message, setMessage] = useState(""),
    [busy, start] = useTransition(),
    router = useRouter();
  useEffect(() => {
    setChanged(false);
    setMessage("");
    const polling = learningPoller({
      initial: initialToken,
      available: () => !document.hidden && navigator.onLine,
      changed: () => setChanged(true),
      read: async (signal) => {
        const r = await fetch(
          "/api/learning-changes?classroom=" + encodeURIComponent(classroom),
          {
            headers: { "X-Bookforest-Actor": owner },
            cache: "no-store",
            signal,
          },
        );
        if (r.status === 401) return null;
        if (!r.ok) throw Error();
        const d = await r.json();
        if (typeof d.token !== "string") throw Error();
        return d.token;
      },
    });
    const resume = () => {
      if (!document.hidden) polling.refresh();
    };
    polling.start();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      polling.stop();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [owner, classroom, tab, initialToken]);
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
