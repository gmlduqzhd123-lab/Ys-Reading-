"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/auth";
import { accountOperation, operationsCommand } from "@/app/operations/actions";
import { logout } from "@/app/actions";
import { statusLabels, type OperationsState } from "@/lib/operations";
export function AccountPanel({
  profile,
  operator,
  deletions,
}: {
  profile: Profile;
  operator: boolean;
  deletions: OperationsState["deletions"];
}) {
  const [busy, start] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  const fresh =
    profile.account_active !== false && profile.session_fresh !== false;
  const ready = fresh && !profile.must_change_password;
  const command = (name: string, payload: Record<string, unknown>) =>
    start(async () => {
      const r = await operationsCommand(name, payload, crypto.randomUUID());
      setMessage(r.message);
      if (r.ok) router.refresh();
    });
  return (
    <div className="operations-page">
      <span className="eyebrow">MY ACCOUNT</span>
      <h1>계정·참여 관리</h1>
      <p>
        {profile.display_name} ·{" "}
        {profile.role === "teacher" ? "선생님" : "학생"}
      </p>
      <section className="ops-card">
        <h2>나의 계정 상태</h2>
        <p>
          {!fresh
            ? "계정 이용이 중지되었거나 로그인 정보가 만료되었어요. 다시 로그인하거나 담당 선생님에게 문의해 주세요."
            : profile.must_change_password
              ? "처음 받은 비밀번호를 나만의 비밀번호로 바꿔 주세요. 변경을 마치면 새 비밀번호로 다시 로그인해요."
              : "계정을 이용할 수 있어요."}
        </p>
        <div className="ops-actions">
          <form action={logout}>
            <button className="button button-outline">로그아웃</button>
          </form>
          {ready && (
            <Link className="button button-outline" href="/hub">
              나의 책장
            </Link>
          )}
          {ready && (profile.role === "teacher" || operator) && (
            <Link className="button button-primary" href="/operations">
              학생 계정·기록 관리
            </Link>
          )}
        </div>
      </section>
      {fresh && (
        <section className="ops-card">
          <h2>비밀번호 바꾸기</h2>
          <form
            className="ops-form"
            action={(fd) => {
              const currentPassword = String(fd.get("currentPassword") ?? "");
              const password = String(fd.get("password") ?? "");
              if (password !== fd.get("repeat")) {
                setMessage("새 비밀번호를 똑같이 두 번 입력해 주세요.");
                return;
              }
              start(async () => {
                const r = await accountOperation({
                  kind: "change_password",
                  requestId: crypto.randomUUID(),
                  currentPassword,
                  password,
                });
                setMessage(r.message);
                if (r.ok) router.replace("/login");
              });
            }}
          >
            <label>
              현재 비밀번호
              <input
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <label>
              새 비밀번호
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <label>
              새 비밀번호 확인
              <input
                type="password"
                name="repeat"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <p className="muted">
              영문 대문자·소문자·숫자를 포함해 12자 이상으로 정해 주세요.
            </p>
            <button className="button button-primary" disabled={busy}>
              비밀번호 변경
            </button>
          </form>
        </section>
      )}
      {ready && profile.role === "student" && (
        <section className="ops-card">
          <h2>참여 동의와 기록</h2>
          <p>
            {profile.consent_status === "verified"
              ? "보호자 동의 확인이 완료되었어요."
              : "보호자 동의 확인 전에는 학습 기록을 읽거나 작성할 수 없어요. 담당 선생님에게 확인을 요청해 주세요."}
          </p>
          <p>
            동의를 철회하면 학습 데이터 이용과 글 공개가 즉시 중단돼요. 기록을
            완전히 지우려면 삭제 요청도 진행해 주세요.
          </p>
          <div className="ops-actions">
            <button
              className="button button-outline"
              disabled={busy || profile.consent_status !== "verified"}
              onClick={() => {
                if (
                  window.confirm(
                    "참여 동의를 철회할까요? 학습 기록 이용과 글 공개가 즉시 중단돼요.",
                  )
                )
                  command("consent_withdraw", {});
              }}
            >
              참여 동의 철회
            </button>
            <button
              className="button button-outline"
              disabled={
                busy ||
                deletions.some(
                  (r) =>
                    r.scope === "account" &&
                    ["pending", "approved", "purged"].includes(r.status),
                )
              }
              onClick={() => {
                if (
                  window.confirm(
                    "계정과 모든 학급의 학습 기록 삭제를 요청할까요? 운영자 검토·승인 후 삭제되며 복구할 수 없어요.",
                  )
                )
                  command("deletion_request", {});
              }}
            >
              계정·전체 기록 삭제 요청
            </button>
          </div>
          {deletions.map((r) => (
            <p key={r.id}>
              {r.scope === "account" ? "계정·전체 기록" : "학급 기록"} 삭제:{" "}
              {statusLabels[r.status] ?? r.status}
            </p>
          ))}
        </section>
      )}
      {ready && profile.role === "student" && (
        <details className="ops-card">
          <summary>선생님 계정으로 준비 중인가요?</summary>
          <p>
            학생으로 발급받거나 학급에 등록된 계정은 교사 권한을 신청할 수
            없어요. 운영자가 신원을 확인한 뒤 권한을 승인해요.
          </p>
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => command("teacher_request", {})}
          >
            교사 권한 확인 신청
          </button>
        </details>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </div>
  );
}
