"use client";
import { useState, useTransition } from "react";
import {
  sendTeacherLoginLink,
  startTeacherGoogleLogin,
} from "@/app/auth/actions";
export function TeacherEmailLogin({
  configured,
  googleEnabled = false,
}: {
  configured: boolean;
  googleEnabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <details className="teacher-email-login">
      <summary>선생님·운영자 처음 시작하기</summary>
      <p>
        Google 또는 이메일로 본인 확인 후 로그인해요. 교사 권한은 운영자 확인이
        필요하며, 미리 초대된 최초 운영자는 인증 후 등록이 완료됩니다.
      </p>
      {googleEnabled && (
        <form
          action={() =>
            start(async () => {
              const r = await startTeacherGoogleLogin();
              if (r) setMessage(r.message);
            })
          }
        >
          <button
            className="button button-primary"
            disabled={!configured || pending}
          >
            Google로 선생님·운영자 로그인
          </button>
          <p className="muted">
            이메일 링크 없이 Google 계정으로 본인 확인을 진행해요.
          </p>
        </form>
      )}
      <form
        action={(form) =>
          start(async () => {
            const r = await sendTeacherLoginLink(form);
            setMessage(r.message);
          })
        }
      >
        <label htmlFor="teacher-email">선생님 이메일</label>
        <input
          id="teacher-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={!configured || pending}
        />
        <button
          className="button button-outline"
          disabled={!configured || pending}
        >
          {pending ? "인증 요청 중…" : "이메일 로그인 링크 받기"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
      <p className="muted">
        학생은 선생님에게 받은 아이디와 비밀번호로 입장해 주세요.
      </p>
    </details>
  );
}
