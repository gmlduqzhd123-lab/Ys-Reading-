"use client";
import type { ReactNode } from "react";
import type { StudioState } from "@/lib/studio";

export type UpdateStudio = (
  change: (state: StudioState) => StudioState,
  message?: string,
) => boolean;
export type ToolProps = {
  state: StudioState;
  update: UpdateStudio;
  go: (tool: string) => void;
};
export function Field({
  label,
  value,
  onChange,
  max = 100,
  area = false,
  rows = 4,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  area?: boolean;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="studio-field">
      <span>{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={max}
          rows={rows}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={max}
        />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Panel({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel studio-panel">
      <h2>{title}</h2>
      {intro && <p>{intro}</p>}
      {children}
    </section>
  );
}
export function downloadHtml(name: string, html: string) {
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
