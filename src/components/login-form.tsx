"use client";
import { useState, useTransition } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { login } from "@/app/actions";

export function LoginForm({ configured, intent, next, teacher = false }: {
  configured: boolean;
  intent?: "classroom";
  next?: string;
  teacher?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <form
      action={(formData) => {
        setMessage("");
        startTransition(async () => {
          const result = await login(formData);
          if (result.ok && result.data) window.location.replace(result.data.destination);
          else setMessage(result.message);
        });
      }}
    >
      {intent && <input type="hidden" name="intent" value={intent} />}
      {next && <input type="hidden" name="next" value={next} />}
      <div className="field">
        <label htmlFor="identifier">{teacher ? "선생님 이메일" : "학생 아이디 또는 선생님 이메일"}</label>
        <input
          id="identifier"
          name="identifier"
          required
          type={teacher ? "email" : "text"}
          autoComplete="username"
          placeholder={teacher ? "학교에서 사용하는 이메일" : "선생님에게 받은 아이디"}
          maxLength={254}
          disabled={!configured || pending}
        />
      </div>
      <div className="field">
        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="비밀번호를 입력해 주세요"
          maxLength={256}
          disabled={!configured || pending}
        />
      </div>
      {message && (
        <p className="form-status error" role="alert">
          {message}
        </p>
      )}
      <button
        className="button button-primary"
        type="submit"
        disabled={!configured || pending}
      >
        {pending ? "교실 문을 열고 있어요…" : teacher ? "비밀번호로 로그인" : "내 교실로 들어가기"}
        <ArrowRight size={16} />
      </button>
      <div className="login-help">
        <LockKeyhole size={13} /> 공용 기기에서는 활동을 마친 뒤 꼭 로그아웃해
        주세요.
        <br />
        {teacher ? "비밀번호를 잊었다면 이메일 로그인 링크를 요청하세요." : "아이디나 비밀번호를 잊었다면 담당 선생님에게 알려 주세요."}
      </div>
    </form>
  );
}
