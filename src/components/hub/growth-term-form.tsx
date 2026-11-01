"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { growthTermCommand } from "@/app/hub/growth-term-actions";
import type { GrowthTermCommand } from "@/lib/growth-terms";
export function GrowthTermForm({
  command,
  payload,
  children,
  label = "저장하기",
  disabled = false,
  onSuccess,
}: {
  command: GrowthTermCommand;
  payload: (f: FormData) => Record<string, unknown>;
  children?: ReactNode;
  label?: string;
  disabled?: boolean;
  onSuccess?: (r: Record<string, unknown>) => void;
}) {
  const router = useRouter(),
    key = useRef<string | null>(null),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [result, setResult] = useState<{ ok: boolean; message: string } | null>(
      null,
    );
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
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        const f = new FormData(e.currentTarget);
        lock.current = true;
        setBusy(true);
        try {
          const data = payload(f);
          if (
            ["promote", "promote_append"].includes(command) &&
            (!Array.isArray(data.students) ||
              data.students.length < 1 ||
              data.students.length > 100)
          ) {
            setResult({
              ok: false,
              message: "진급할 학생을 1~100명 선택해 주세요.",
            });
            return;
          }
          key.current ??= crypto.randomUUID();
          const r = await growthTermCommand({
            command,
            payload: data,
            requestId: key.current,
          });
          setResult(r);
          if (r.ok) {
            setDirty(false);
            key.current = null;
            onSuccess?.(r.data ?? {});
            router.refresh();
          }
        } catch {
          setResult({
            ok: false,
            message: "연결이 끊겼어요. 입력을 유지한 채 다시 시도해 주세요.",
          });
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset className="hub-fieldset" disabled={disabled || busy}>
        {children}
        <button type="submit" className="button button-primary">
          {busy ? "처리 중…" : label}
        </button>
      </fieldset>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`form-status ${result.ok ? "" : "error"}`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
