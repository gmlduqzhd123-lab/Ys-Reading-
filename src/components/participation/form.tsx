"use client";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { participationCommand } from "@/app/hub/participation-actions";
import type { participationCommands } from "@/lib/participation";
export function ParticipationForm({
  command,
  payload,
  children,
  label = "저장하기",
  onSuccess,
}: {
  command: (typeof participationCommands)[number];
  payload: (data: FormData) => Record<string, unknown>;
  children?: ReactNode;
  label?: string;
  onSuccess?: (data: Record<string, unknown>) => void;
}) {
  const router = useRouter(),
    key = useRef<string | null>(null);
  const [busy, start] = useTransition(),
    [message, setMessage] = useState(""),
    [ok, setOk] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <form
      data-hub-dirty={dirty ? "true" : "false"}
      onChange={() => {
        key.current = null;
        setDirty(true);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          try {
            key.current ??= crypto.randomUUID();
            const result = await participationCommand({
              command,
              payload: payload(fd),
              requestId: key.current,
            });
            setOk(result.ok);
            setMessage(result.message);
            if (result.ok) {
              key.current = null;
              setDirty(false);
              onSuccess?.(result.data ?? {});
              router.refresh();
            }
          } catch {
            setOk(false);
            setMessage("연결이 끊겼어요. 입력을 유지한 채 다시 시도해 주세요.");
          }
        });
      }}
    >
      <fieldset className="hub-fieldset" disabled={busy}>
        {children}
        <button className="button button-primary" type="submit">
          {busy ? "처리 중…" : label}
        </button>
      </fieldset>
      {message && (
        <p
          role={ok ? "status" : "alert"}
          className={ok ? "form-status" : "form-status error"}
        >
          {message}
        </p>
      )}
    </form>
  );
}
export const value = (fd: FormData, key: string) => String(fd.get(key) ?? "");
export const iso = (fd: FormData, key: string) =>
  new Date(value(fd, key) + "T23:59:59+09:00").toISOString();
export function TextArea({
  label,
  name,
  defaultValue = "",
  maxLength = 2000,
  rows = 3,
  required = true,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  maxLength?: number;
  rows?: number;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue}
        maxLength={maxLength}
        rows={rows}
        required={required}
      />
    </label>
  );
}
