"use client";
import { useState, useTransition } from "react";
import {
  checkDomesticProvider,
  requestCloudBackup,
} from "@/app/hub/completion-actions";
export function ProviderCheck() {
  const [message, setMessage] = useState(""),
    [busy, start] = useTransition();
  const run = (operation: () => Promise<{ message: string }>) =>
    start(async () => {
      try {
        setMessage((await operation()).message);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "다시 연결해 주세요.");
      }
    });
  return (
    <section className="panel">
      <h2>운영 연결 확인·예약 백업 요청</h2>
      <div className="button-row">
        <button
          className="button button-outline"
          disabled={busy}
          onClick={() => run(checkDomesticProvider)}
        >
          국내 도서 제공자 실제 연결 검사
        </button>
        <button
          className="button button-outline"
          disabled={busy}
          onClick={() => run(requestCloudBackup)}
        >
          서버 예약 작업에 새 백업 요청
        </button>
      </div>
      <p className="form-help">
        도서 키는 비공개 입력 도구로 준비합니다. 새 백업 요청에는 최근 2단계
        인증이 필요해요.
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
