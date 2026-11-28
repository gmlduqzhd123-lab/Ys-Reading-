"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { rememberHubClass } from "@/app/hub/completion-actions";
import { hubHref } from "@/lib/hub-navigation";
export function ClassContext({
  owner,
  tab,
  selected,
  classes,
  unavailable,
}: {
  owner: string;
  tab: string;
  selected: string;
  classes: { id: string; name: string }[];
  unavailable: string[];
}) {
  const query = useSearchParams();
  const router = useRouter(),
    [busy, start] = useTransition(),
    [message, setMessage] = useState("");
  return (
    <div className="workspace-class-context" aria-busy={busy}>
      <label className="field">
        지금 보고 있는 학급
        <select
          aria-label="지금 보고 있는 학급"
          disabled={busy}
          value={selected}
          onChange={(e) => {
            const id = e.target.value;
            if (
              document.querySelector('[data-hub-dirty="true"]') &&
              !window.confirm(
                "저장하지 않은 입력이 있어요. 먼저 저장하려면 취소해 주세요. 학급을 바꿀까요?",
              )
            )
              return;
            start(async () => {
              setMessage("");
              try {
                await rememberHubClass(owner, id);
                const nextTab = unavailable.includes(id) ? "today" : tab;
                const keys = nextTab === "search" ? ["kind", "q", "from", "to", "status"]
                  : nextTab === "overview" ? ["week"] : nextTab === "review" ? ["reviewKind"] : [];
                const filters = Object.fromEntries(keys.map(key => [key, query.get(key) ?? ""]));
                router.push(hubHref(nextTab, id, filters));
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "학급을 확인해 주세요.",
                );
              }
            });
          }}
        >
          <option value="">접근 가능한 모든 학급</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {(busy || message) && <p role="status">{busy ? "학급을 바꾸고 있어요." : message}</p>}
    </div>
  );
}
