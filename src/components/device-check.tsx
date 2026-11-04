"use client";
import Link from "next/link";
import { useState } from "react";
const manualItems = [
  "이 기기에서 한글을 입력하고 저장한 뒤 새로고침해 기록을 확인했어요",
  "로그아웃 후 다시 로그인해 담당 학급과 기록을 확인했어요",
  "네트워크를 끊었다 연결하고 임시 글 복구·다시 저장을 확인했어요",
  "Google 연결·팝업 허용 후 문서 또는 시트를 실제로 열었어요",
];
type Result = {
  checkedAt: string;
  secure: boolean;
  storage: boolean;
  crypto: boolean;
  online: boolean;
  health: boolean;
  latencyMs: number;
};
export function DeviceCheck() {
  const [kind, setKind] = useState("학교 PC"),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [manual, setManual] = useState<boolean[]>(manualItems.map(() => false)),
    [popup, setPopup] = useState<boolean | null>(null),
    [message, setMessage] = useState("");
  async function check() {
    setBusy(true);
    setMessage("");
    let storage = false,
      health = false;
    const started = performance.now(),
      key = "bookforest-device-check-" + crypto.randomUUID();
    try {
      localStorage.setItem(key, "test");
      storage = localStorage.getItem(key) === "test";
      localStorage.removeItem(key);
    } catch {}
    try {
      const r = await fetch("/api/health?deep=1", {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        }),
        d = await r.json();
      health = r.ok && d.status === "ok";
    } catch {}
    setResult({
      checkedAt: new Date().toISOString(),
      secure: window.isSecureContext,
      storage,
      crypto: !!crypto.subtle,
      online: navigator.onLine,
      health,
      latencyMs: Math.round(performance.now() - started),
    });
    setBusy(false);
  }
  function download() {
    if (!result) return;
    const value = {
      format: "bookforest-device-check",
      version: 1,
      deviceKind: kind,
      automatic: result,
      popupAllowed: popup,
      manual: manualItems.map((label, i) => ({
        label,
        confirmedByUser: manual[i],
      })),
      physicalSchoolApproval: false,
    };
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "책숲-기기점검.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMessage(
      "점검 결과를 준비했어요. 학교 승인 기록이 아닌 이 기기의 사용자 확인 결과입니다.",
    );
  }
  return (
    <div className="operations-page">
      <span className="eyebrow">READY FOR CLASS</span>
      <h1>수업 전 기기 점검</h1>
      <p>
        수업에 사용할 기기와 학교 네트워크에서 직접 실행해 주세요. 계정·학생
        글·IP·브라우저 식별 정보는 결과 파일에 넣지 않습니다.
      </p>
      <section className="panel">
        <h2>자동 연결 검사</h2>
        <label className="field">
          지금 점검하는 기기
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setResult(null);
              setManual(manualItems.map(() => false));
              setPopup(null);
            }}
          >
            <option>학교 PC</option>
            <option>학교 태블릿</option>
            <option>개인 PC·휴대전화</option>
          </select>
        </label>
        <button
          className="button button-primary"
          onClick={() => void check()}
          disabled={busy}
        >
          {busy ? "검사 중…" : "이 기기 연결 검사"}
        </button>
        {result && (
          <div role="status">
            <p>
              보안 연결: {result.secure ? "사용 가능" : "확인 필요"} · 글 보관
              저장소: {result.storage ? "사용 가능" : "차단됨"} · 암호화:{" "}
              {result.crypto ? "사용 가능" : "확인 필요"}
            </p>
            <p>
              브라우저 온라인 신호: {result.online ? "연결됨" : "끊김"} · 실제
              서버 응답: {result.health ? "정상" : "확인 필요"} · 이번 검사{" "}
              {result.latencyMs}ms
            </p>
          </div>
        )}
        <button
          className="button button-outline"
          onClick={() => {
            const w = window.open(
              "about:blank",
              "_blank",
              "width=320,height=240",
            );
            setPopup(!!w);
            if (w) w.close();
          }}
        >
          이 기기 팝업 허용 확인
        </button>
        {popup !== null && (
          <p role="status">
            {popup
              ? "검사 창을 열 수 있어요. Google 로그인은 아래에서 별도로 확인하세요."
              : "팝업이 차단됐어요. 책숲 사이트의 팝업을 허용하고 다시 검사하세요."}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>수업 흐름 직접 확인</h2>
        {manualItems.map((item, i) => (
          <label key={item} className="hub-check">
            <input
              type="checkbox"
              checked={manual[i]}
              onChange={(e) =>
                setManual((old) =>
                  old.map((x, n) => (n === i ? e.target.checked : x)),
                )
              }
            />
            {item}
          </label>
        ))}
        <div className="hub-inline">
          <Link href="/login">로그인 확인</Link>
          <Link href="/hub?tab=reading">독서 기록·글 저장</Link>
          <Link href="/hub?tab=exports">Google 내보내기 확인</Link>
          <Link href="/status">장애·복구 안내</Link>
        </div>
        <p>
          자동 검사 통과만으로 실제 수업·Google 내보내기·학교 보안 정책의 통과를
          판단하지 않습니다. 학교에서 막힌 항목은 담당 관리자와 허용 범위를
          확인하세요.
        </p>
        <button
          className="button button-primary"
          disabled={!result || busy}
          onClick={download}
        >
          이 기기 점검 결과 저장
        </button>
      </section>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
