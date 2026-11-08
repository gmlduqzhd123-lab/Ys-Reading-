"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rememberHubClass } from "@/app/hub/completion-actions";
import { hubHref } from "@/lib/hub-navigation";
export function ClassContext({
  owner,
  tab,
  selected,
  classes,
}: {
  owner: string;
  tab: string;
  selected: string;
  classes: { id: string; name: string }[];
}) {
  const router = useRouter(),
    [busy, start] = useTransition(),
    [message, setMessage] = useState("");
  return (
    <div className="panel">
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
              try {
                await rememberHubClass(owner, id);
                router.push(hubHref(tab, id));
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
      <p className="form-help">
        선택한 학급을 메뉴를 옮겨도 유지합니다. 학급 선택은 접근 권한을 변경하지
        않습니다.
      </p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
