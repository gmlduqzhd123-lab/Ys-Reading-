"use client";
import {formatKoreanDate} from "@/lib/rules";
import Link from "next/link";
import { useState, useTransition, useRef } from "react";
import { saveRecoveryCheck } from "@/app/account/recovery-actions";
import {manageOperatorInvitation} from "@/app/hub/completion-actions";
const labels = {
  backup: "외부 파일의 복호화·복원 확인",
  database: "운영과 다른 DB의 자료 복원",
  authentication: "복원한 계정으로 실제 로그인",
  mfa: "복원한 운영자 인증앱으로 확인",
  permissions: "학생·교사·익명 접근 권한 확인",
  privacy: "최신 동의·삭제·접근 보류 확인",
  worker: "계정 작업자 배포·호환 검사",
  google: "Google 로그인·Drive 콜백 확인",
};
const empty = Object.fromEntries(
  Object.keys(labels).map((k) => [k, false]),
) as Record<keyof typeof labels, boolean>;
export type RecoveryReadiness = {
  operatorCount: number;
  pendingEmails: { email: string; expiresAt: string }[];
  rehearsals: {
    id: string;
    target_ref: string;
    steps: typeof empty;
    revision: number;
    updated_at: string;
  }[];
};
export function RecoveryReadinessPanel({
  state,
}: {
  state: RecoveryReadiness | null;
}) {
  const [target, setTarget] = useState(""),
    [steps, setSteps] = useState(empty),
    [message, setMessage] = useState(""),
    [busy, start] = useTransition();
  const request = useRef<{ hash: string; id: string } | null>(null);
  const [email,setEmail]=useState(""),[name,setName]=useState(""),[revoke,setRevoke]=useState(false);
  return (
    <section className="panel">
      <h2>복구 훈련·대체 운영자 준비</h2>
      <p>
        이 화면은 본인이 확인한 훈련 이력을 보관합니다. 체크만으로 별도
        PC·클라우드 복원이나 운영 서버 전환이 완료되지는 않습니다.
      </p>
      {!state ? (
        <p>준비 상태를 읽지 못했어요.</p>
      ) : (
        <>
          <p>
            활성 운영자 {state.operatorCount}명 ·{" "}
            {state.operatorCount < 2
              ? "대체 운영자의 본인 수락과 2단계 인증이 필요해요."
              : "복수 운영자 등록 확인"}
          </p>
          {state.pendingEmails.map((p) => (
            <p key={p.email}>
              수락 대기: {p.email} ·{" "}
              {formatKoreanDate(p.expiresAt,{year:"numeric",month:"numeric",day:"numeric"})}까지
            </p>
          ))}
          <details><summary>대체 운영자 초대 준비·재발급·취소</summary><p>최근 2단계 인증이 필요합니다. 이메일을 자동 발송하지 않으며 소유자가 직접 수락해야 합니다.</p><form onSubmit={e=>{e.preventDefault();start(async()=>{try{setMessage((await manageOperatorInvitation({email,name,revoke})).message);}catch(e){setMessage(e instanceof Error?e.message:"연결을 확인해 주세요.");}});}}><label className="field">초대할 이메일<input type="email" value={email} required maxLength={254} onChange={e=>setEmail(e.target.value)}/></label><label className="field">운영자 표시 이름<input value={name} required minLength={2} maxLength={40} onChange={e=>setName(e.target.value)}/></label><label className="hub-check"><input type="checkbox" checked={revoke} onChange={e=>setRevoke(e.target.checked)}/>이 이메일의 대기 중 초대 취소</label><button className="button button-outline" disabled={busy}>초대 설정 저장</button></form></details>
          <details>
            <summary>다른 프로젝트의 복구 훈련 기록</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const hash = JSON.stringify({ target, steps });
                  if (request.current?.hash !== hash)
                    request.current = { hash, id: crypto.randomUUID() };
                  const r = await saveRecoveryCheck({
                    target,
                    steps,
                    id: null,
                    revision: 0,
                    request: request.current.id,
                  });
                  setMessage(r.message);
                  if (r.ok) request.current = null;
                });
              }}
            >
              <label className="field">
                훈련 대상 프로젝트 참조 ID
                <input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  pattern="[a-z0-9]{20}"
                  minLength={20}
                  maxLength={20}
                  required
                />
              </label>
              {Object.entries(labels).map(([key, label]) => (
                <label className="hub-check" key={key}>
                  <input
                    type="checkbox"
                    checked={steps[key as keyof typeof labels]}
                    onChange={(e) =>
                      setSteps((s) => ({ ...s, [key]: e.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
              <button className="button button-outline" disabled={busy}>
                직접 확인한 훈련 이력 저장
              </button>
            </form>
          </details>
          <details>
            <summary>이전 훈련 {state.rehearsals.length}건</summary>
            {state.rehearsals.map((r) => (
              <p key={r.id}>
                {r.target_ref} · {Object.values(r.steps).filter(Boolean).length}
                /8개 본인 확인 ·{" "}
                {formatKoreanDate(r.updated_at)}
              </p>
            ))}
          </details>
        </>
      )}
      <p>
        <Link href="/account/security">운영자 2단계 인증 →</Link> ·{" "}
        <Link href="/collaboration">운영자·교사 권한 관리 →</Link>
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
