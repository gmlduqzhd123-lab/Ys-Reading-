"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
export function RefreshButton() {
  const router = useRouter(),
    [busy, start] = useTransition();
  return (
    <button
      className="button button-outline"
      disabled={busy}
      onClick={() => start(() => router.refresh())}
    >
      {busy ? "새 기록을 불러오는 중…" : "새 활동·피드백 불러오기"}
    </button>
  );
}
