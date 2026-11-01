"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { clearDraftRecovery, notifyDraftLogout } from "@/lib/draft-recovery";
export function ConnectionBanner() {
  const [offline, setOffline] = useState(false),
    [reconnected, setReconnected] = useState(false);
  const path = usePathname();
  useEffect(() => {
    if (path === "/login") notifyDraftLogout();
  }, [path]);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("bookforest-draft-privacy");
    channel.onmessage = (e) => {
      if (e.data === "logout") clearDraftRecovery();
    };
    return () => channel.close();
  }, []);
  useEffect(() => {
    setOffline(!navigator.onLine);
    const down = () => {
        setOffline(true);
        setReconnected(false);
      },
      up = () => {
        setOffline(false);
        setReconnected(true);
        window.dispatchEvent(new Event("bookforest:reconnected"));
      };
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
    };
  }, []);
  if (!offline && !reconnected) return null;
  return (
    <div className="connection-banner" role="status">
      {offline
        ? "인터넷 연결이 끊겼어요. 지금 입력은 화면에 남아 있어요. 저장 완료를 확인하기 전에는 탭을 닫지 말고 글을 파일로 보관해 주세요."
        : "인터넷에 다시 연결됐어요. 글의 저장 상태를 확인하고 ‘다시 저장’을 눌러 주세요."}{" "}
      <Link href="/status">연결 상태 점검</Link>
      {!offline && (
        <button
          onClick={() => setReconnected(false)}
          aria-label="재연결 안내 닫기"
        >
          닫기
        </button>
      )}
    </div>
  );
}
