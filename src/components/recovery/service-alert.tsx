"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MonitorState } from "@/lib/monitoring";
export function ServiceAlert() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    let disposed = false,
      failed = false;
    const controller = new AbortController();
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/monitor", { signal: controller.signal });
        if (!r.ok) throw Error("UNAVAILABLE");
        const d = (await r.json()) as { monitor: MonitorState | null },
          v = d.monitor?.checks.find((c) => c.source === "supabase-cron");
        if (!v) return;
        const issue = v.stale || !v.healthy;
        if (disposed) return;
        setMessage(
          issue
            ? v.stale
              ? "서버 정기 점검 신호가 오래됐어요. 저장 상태와 연결 점검을 확인해 주세요."
              : "서버 정기 점검에서 문제가 확인됐어요. 입력한 글을 보관하고 저장 완료 여부를 확인해 주세요."
            : failed
              ? "서버 정기 점검에서 연결 회복을 확인했어요. 글의 저장 상태를 다시 확인해 주세요."
              : "",
        );
        failed = issue;
      } catch {
        if (!disposed) {
          failed = true;
          setMessage(
            "서버 점검 정보를 확인하지 못했어요. 연결 점검에서 저장 상태를 확인해 주세요.",
          );
        }
      }
    }
    void check();
    const timer = setInterval(() => void check(), 60000);
    document.addEventListener("visibilitychange", check);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return message ? (
    <div className="connection-banner" role="status">
      {message} <Link href="/status">연결·복구 확인</Link>
    </div>
  ) : null;
}
