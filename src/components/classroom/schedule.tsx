"use client";
import { useState } from "react";
import type { ClassActivity } from "@/lib/classroom-tools";
import { useToolAction } from "./use-tool-action";
export function ActivitySchedule({
  owner,
  classroom,
  activity,
  archived,
}: {
  owner: string;
  classroom: string;
  activity: ClassActivity;
  archived: boolean;
}) {
  const action = useToolAction(owner, classroom),
    [active, setActive] = useState(activity.active),
    [due, setDue] = useState(
      activity.due_at
        ? new Date(Date.parse(activity.due_at) + 9 * 3600000)
            .toISOString()
            .slice(0, 16)
        : "",
    ),
    [confirmed, setConfirmed] = useState(false);
  return (
    <details className="tool-schedule">
      <summary>마감 연장·다시 열기</summary>
      <p>
        활동 내용과 제출 버전은 유지하며 마감·진행 상태의 변경 이력을 남깁니다.
        날짜는 한국 시간입니다.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await action.run("activity_schedule", {
              id: activity.id,
              revision: activity.revision ?? 0,
              active,
              dueAt: due ? new Date(due + "+09:00").toISOString() : "",
              confirmed,
            })
          )
            setConfirmed(false);
        }}
      >
        <fieldset disabled={archived || action.busy || action.blocked}>
          <label className="tool-choice">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => {
                setActive(e.target.checked);
                setConfirmed(false);
              }}
            />
            학생 제출을 받을 수 있도록 열기
          </label>
          <label className="field">
            새 마감 시각
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => {
                setDue(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label className="tool-choice">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            제출 가능 기간과 진행 상태 변경을 확인했습니다.
          </label>
          <button className="button button-outline" disabled={!confirmed}>
            활동 기간·상태 저장
          </button>
        </fieldset>
      </form>
      <p role="status">{action.message}</p>
    </details>
  );
}
