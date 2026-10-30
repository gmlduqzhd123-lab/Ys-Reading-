"use client";
import { useState, useTransition } from "react";
import { sendTeacherLoginLink } from "@/app/auth/actions";
export function TeacherEmailLogin({ configured }: { configured: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <details className="teacher-email-login">
      <summary>선생님·운영자 이메일로 처음 시작하기</summary>
      <p>
        이메일 소유 확인 후 로그인해요. 교사 권한은 운영자 확인이 필요하며, 미리
        초대된 최초 운영자는 인증 후 등록이 완료됩니다.
      </p>
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
          {pending ? "인증 메일 요청 중…" : "이메일 로그인 링크 받기"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
      <p className="muted">
        학생은 선생님에게 받은 아이디와 비밀번호로 입장해 주세요.
      </p>
    </details>
  );
}
