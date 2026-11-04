"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
type Factor = { id: string; friendly_name?: string; status: string };
export function OperatorMfa() {
  const [factors, setFactors] = useState<Factor[]>([]),
    [unfinished, setUnfinished] = useState<Factor[]>([]),
    [pending, setPending] = useState<{ id: string; qr: string } | null>(null),
    [selected, setSelected] = useState(""),
    [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [recent, setRecent] = useState(false);
  async function load() {
    const c = createClient(),
      [f, s] = await Promise.all([
        c.auth.mfa.listFactors(),
        c.rpc("staff_security_state"),
      ]);
    if (f.error || s.error)
      throw Error("인증 정보를 읽지 못했어요. 다시 로그인해 주세요.");
    const verified = f.data.totp.filter((v) => v.status === "verified");
    setUnfinished(
      f.data.all.filter(
        (v) => v.factor_type === "totp" && v.status === "unverified",
      ),
    );
    setFactors(verified);
    setSelected((v) =>
      verified.some((f) => f.id === v) ? v : (verified[0]?.id ?? ""),
    );
    setRecent(s.data?.recent === true);
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
    const refresh = () => {
      if (document.visibilityState === "visible")
        load().catch(() => setRecent(false));
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "인증을 처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="operations-page">
      <span className="eyebrow">OPERATOR SECURITY</span>
      <h1>운영자 2단계 인증</h1>
      <p>
        학생 동의 승인·자료 삭제·교사 권한 변경·담임 인계 전 인증앱으로 다시
        확인합니다. 확인 후 15분간 중요 작업을 진행할 수 있어요.
      </p>
      <p className="notice" role="status">
        {recent
          ? "최근 2단계 인증을 확인했어요."
          : "중요 작업을 진행하려면 인증앱 확인이 필요해요."}
      </p>
      <section className="panel">
        <h2>인증앱 등록·확인</h2>
        <p>
          본인의 휴대전화 인증앱에서 직접 등록해 주세요. QR 코드와 인증번호를
          다른 사람이나 채팅에 보내지 마세요. 기기 분실에 대비해 안전한 보조
          기기도 등록할 수 있습니다.
        </p>
        <ol>
          <li>
            휴대전화에 Google Authenticator(구글 OTP) 또는 사용 중인 인증앱을
            준비하세요.
          </li>
          <li>아래 ‘새 인증앱 등록 준비’를 누릅니다.</li>
          <li>
            휴대전화의 일반 카메라 대신, 인증앱 안의 ‘＋ → QR 코드 스캔’으로 PC
            화면을 스캔하세요.
          </li>
          <li>
            인증앱에 표시되는 책숲의 6자리 번호를 아래 칸에 입력하고 등록을
            확인합니다.
          </li>
        </ol>
        <p>
          스캔 후 메모 앱이나 <code>otpauth://</code>로 시작하는 긴 문자가
          열리면 인증앱 등록이 아닙니다. 등록 준비를 취소한 뒤 인증앱 안에서 새
          QR을 스캔하세요. 같은 휴대전화에서 책숲을 보고 있다면 PC에 이 화면을
          열어 스캔할 수 있습니다.
        </p>
        <a
          className="text-link"
          href="https://support.google.com/accounts/answer/1066447?hl=ko"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google OTP 공식 설치·사용 안내 →
        </a>
        {!pending && unfinished.length > 0 && (
          <details>
            <summary>이전에 끝내지 않은 등록 준비 정리</summary>
            <p>
              새로고침 전에 준비만 하고 6자리 번호 확인을 마치지 않은
              항목입니다. QR을 잃었거나 공유했다면 취소한 뒤 새로 준비하세요.
              이미 확인한 인증앱은 아래의 별도 해제 절차를 이용합니다.
            </p>
            {unfinished.map((f) => (
              <p key={f.id}>
                {f.friendly_name ?? "미완료 등록"}{" "}
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await createClient().auth.mfa.unenroll({
                        factorId: f.id,
                      });
                      if (r.error)
                        throw Error("이전 등록 준비를 취소하지 못했어요.");
                      await load();
                      setMessage(
                        "미완료 등록을 취소했어요. 새 인증앱을 준비할 수 있습니다.",
                      );
                    })
                  }
                >
                  이 미완료 등록 취소
                </button>
              </p>
            ))}
          </details>
        )}
        {!pending && (
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const c = createClient();
                const r = await c.auth.mfa.enroll({
                  factorType: "totp",
                  friendlyName:
                    "책숲 운영자 " +
                    new Date().toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    }) +
                    " " +
                    crypto.randomUUID().slice(0, 4),
                });
                if (r.error)
                  throw Error(
                    "인증앱을 준비하지 못했어요. 기존 등록 상태를 확인해 주세요.",
                  );
                setPending({ id: r.data.id, qr: r.data.totp.qr_code });
                setCode("");
              })
            }
          >
            새 인증앱 등록 준비
          </button>
        )}
        {pending && (
          <div>
            <img
              src={pending.qr}
              width={220}
              height={220}
              alt="운영자 본인의 인증앱으로 스캔할 등록 QR 코드"
            />
            <p>
              인증앱으로 스캔한 뒤 표시되는 6자리 번호를 아래에 직접 입력하세요.
            </p>
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await createClient().auth.mfa.unenroll({
                    factorId: pending.id,
                  });
                  if (r.error) throw Error("등록 준비를 취소하지 못했어요.");
                  setPending(null);
                  setCode("");
                  await load();
                })
              }
            >
              이번 등록 준비 취소
            </button>
          </div>
        )}
        {!pending && !!factors.length && (
          <label className="field">
            확인할 인증앱
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {factors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.friendly_name ?? "등록된 인증앱"}
                </option>
              ))}
            </select>
          </label>
        )}
        {(pending || factors.length > 0) && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const factorId = pending?.id ?? selected;
                if (!/^\d{6}$/.test(code))
                  throw Error("6자리 인증번호를 입력해 주세요.");
                const r = await createClient().auth.mfa.challengeAndVerify({
                  factorId,
                  code,
                });
                setCode("");
                if (r.error)
                  throw Error(
                    "인증번호 또는 기기 시간을 확인하고 다시 입력해 주세요.",
                  );
                setPending(null);
                await load();
                setMessage("2단계 인증을 확인했어요. 중요 작업을 이어가세요.");
              });
            }}
          >
            <label className="field">
              인증앱의 6자리 번호
              <input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                type="password"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={6}
                disabled={busy}
              />
            </label>
            <button className="button button-primary" disabled={busy}>
              {busy
                ? "확인 중…"
                : pending
                  ? "등록하고 인증 확인"
                  : "2단계 인증 확인"}
            </button>
          </form>
        )}
        {!!factors.length && (
          <details>
            <summary>기존 인증앱 연결 해제</summary>
            <p>
              다른 인증앱을 먼저 준비하세요. 마지막 앱을 해제하면 새 앱을
              등록하기 전까지 중요 작업을 할 수 없습니다. 해제에는 현재 2단계
              인증이 필요합니다.
            </p>
            <button
              className="button button-outline"
              disabled={busy || !recent}
              onClick={() => {
                if (window.confirm("선택한 인증앱의 연결을 해제할까요?"))
                  run(async () => {
                    const r = await createClient().auth.mfa.unenroll({
                      factorId: selected,
                    });
                    if (r.error)
                      throw Error(
                        "현재 2단계 인증을 다시 확인한 뒤 진행해 주세요.",
                      );
                    await load();
                    setMessage("선택한 인증앱을 해제했어요.");
                  });
              }}
            >
              선택한 인증앱 해제
            </button>
          </details>
        )}
      </section>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <p>
        기기를 모두 잃으면 프로젝트 소유자가 Supabase 관리 화면에서 본인 확인 후
        인증 수단을 복구해야 합니다. 학생이나 일반 교사가 운영자 인증을 대신할
        수 없습니다.
      </p>
      <div className="ops-actions">
        <Link href="/operations" className="button button-primary">
          운영 관리로 돌아가기
        </Link>
        <Link href="/account" className="button button-outline">
          나의 계정
        </Link>
      </div>
    </div>
  );
}
