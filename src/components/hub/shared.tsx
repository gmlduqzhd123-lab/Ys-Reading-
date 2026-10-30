"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { hubCommand } from "@/app/hub/actions";
import type { HubCommand } from "@/lib/hub";
import type { Classroom } from "@/lib/data";
export function HubForm({
  command,
  payload,
  children,
  label = "저장하기",
  onSuccess,
  disabled = false,
}: {
  command: HubCommand;
  payload: (form: FormData) => Record<string, unknown>;
  children?: ReactNode;
  label?: string;
  onSuccess?: (data: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
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
        if (busy.current) return;
        const form = e.currentTarget;
        const values = payload(new FormData(form));
        busy.current = true;
        setPending(true);
        setMessage("");
        try {
          key.current ??= crypto.randomUUID();
          const result = await hubCommand({
            command,
            payload: values,
            requestId: key.current,
          });
          setOk(result.ok);
          setMessage(result.message);
          if (result.ok) {
            setDirty(false);
            key.current = null;
            onSuccess?.(result.data ?? {});
            router.refresh();
          }
        } catch {
          setOk(false);
          setMessage(
            "연결이 끊겼어요. 입력 내용을 유지한 채 다시 시도해 주세요.",
          );
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending || disabled} className="hub-fieldset">
        {children}
        <button className="button button-primary" type="submit">
          {pending ? "처리 중…" : label}
        </button>
      </fieldset>
      {message && (
        <p
          className={`form-status ${ok ? "" : "error"}`}
          role={ok ? "status" : "alert"}
        >
          {message}
        </p>
      )}
    </form>
  );
}
export function Field({
  label,
  name,
  defaultValue = "",
  type = "text",
  required = true,
  maxLength,
  help,
  min,
  max,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  required?: boolean;
  maxLength?: number;
  help?: string;
  min?: number | string;
  max?: number | string;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        min={min}
        max={max}
      />
      {help && <small>{help}</small>}
    </label>
  );
}
export function ClassField({
  classes,
  name = "classroomId",
}: {
  classes: Classroom[];
  name?: string;
}) {
  return (
    <label className="field">
      학급
      <select name={name} required>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="hub-empty">{children}</div>;
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel hub-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export const string = (f: FormData, k: string) => String(f.get(k) ?? "");
