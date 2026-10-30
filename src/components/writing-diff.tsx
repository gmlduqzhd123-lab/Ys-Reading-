"use client";
import { useState } from "react";
import { diffWords } from "@/lib/studio";

type Version = {
  id: string;
  version: number;
  title: string;
  body: string;
  reason?: string;
};
export function VersionComparison({ versions }: { versions: Version[] }) {
  const ordered = [...versions].sort((a, b) => a.version - b.version);
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  if (ordered.length < 2)
    return (
      <p className="empty-state">
        두 버전 이상 제출하면 달라진 부분을 나란히 볼 수 있어요.
      </p>
    );
  const before =
    ordered.find((v) => v.id === beforeId && v.id !== ordered.at(-1)!.id) ??
    ordered[0];
  const after =
    ordered.find((v) => v.id === afterId && v.version > before.version) ??
    ordered.at(-1)!;
  const parts = diffWords(before.body, after.body);
  return (
    <div className="version-comparison">
      <div className="studio-two-col">
        <label className="studio-field">
          <span>처음 비교할 글</span>
          <select
            value={before.id}
            onChange={(e) => setBeforeId(e.target.value)}
          >
            {ordered.slice(0, -1).map((v) => (
              <option key={v.id} value={v.id}>
                {v.version}번째 글 · {v.title}
              </option>
            ))}
          </select>
        </label>
        <label className="studio-field">
          <span>그 뒤에 쓴 글</span>
          <select value={after.id} onChange={(e) => setAfterId(e.target.value)}>
            {ordered
              .filter((v) => v.version > before.version)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version}번째 글 · {v.title}
                </option>
              ))}
          </select>
        </label>
      </div>
      <p className="form-help">
        <del>취소선은 고치기 전 표현</del>, <ins>밑줄은 새로 보탠 표현</ins>
        이에요. 긴 글은 본문 전체를 두 칸에 보여줄 수 있어요.
      </p>
      <div className="studio-two-col diff-papers">
        <article className="studio-paper">
          <h3>{before.title}</h3>
          <p className="studio-writing">
            {parts
              .filter((p) => p.kind !== "added")
              .map((p, i) =>
                p.kind === "removed" ? (
                  <del key={i}>{p.text}</del>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
          </p>
        </article>
        <article className="studio-paper">
          <h3>{after.title}</h3>
          <p className="studio-writing">
            {parts
              .filter((p) => p.kind !== "removed")
              .map((p, i) =>
                p.kind === "added" ? (
                  <ins key={i}>{p.text}</ins>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
          </p>
        </article>
      </div>
      {after.reason && (
        <div className="notice">
          <strong>고친 부분과 그 이유</strong>
          <p>{after.reason}</p>
        </div>
      )}
    </div>
  );
}
