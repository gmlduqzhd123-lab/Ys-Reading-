"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { checkGoogleConnection } from "@/app/hub/google-actions";
import { formatOperationsDate } from "@/lib/operations";
export function GoogleConnectionCheck() {
  const [busy, start] = useTransition(),
    [result, setResult] = useState<{
      ok: boolean;
      message: string;
      checkedAt?: string;
    } | null>(null);
  return (
    <div className="google-connection-check">
      <button
        className="button button-outline"
        disabled={busy}
        onClick={() =>
          start(async () => setResult(await checkGoogleConnection()))
        }
      >
        {busy ? "Google에 연결을 확인하고 있어요…" : "Google 연결 실제 점검"}
      </button>
      {result && (
        <p role={result.ok ? "status" : "alert"} className="notice">
          {result.message}
          {result.checkedAt && " · " + formatOperationsDate(result.checkedAt)}
        </p>
      )}
      <p className="form-help">
        학교 계정은 학교의 외부 앱 정책에 따라 연결이 제한될 수 있어요. 연결이
        어려워도 Word·CSV 저장은 사용할 수 있습니다.{" "}
        <Link href="/privacy">Google 권한·개인정보 안내</Link>
      </p>
    </div>
  );
}
