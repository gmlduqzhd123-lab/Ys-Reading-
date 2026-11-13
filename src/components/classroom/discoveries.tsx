"use client";
import { useState } from "react";
import {
  Sprout,
  Flower2,
  TreePine,
  LibraryBig,
  GitCompareArrows,
  Waves,
} from "lucide-react";
import {
  forestDiscoveries,
  rhythmWeek,
  type ClassroomToolState,
} from "@/lib/classroom-tools";
import { koreanDay, activityLabels } from "@/lib/hub";
import { useToolAction } from "./use-tool-action";
const icons = [Sprout, Flower2, TreePine, LibraryBig, GitCompareArrows, Waves];
export function Discoveries({
  owner,
  state,
}: {
  owner: string;
  state: ClassroomToolState;
}) {
  const action = useToolAction(owner, state.classroom.id),
    [target, setTarget] = useState(state.rhythm.target),
    today = koreanDay(),
    week = rhythmWeek(state.days, today);
  return (
    <section className="panel" id="discoveries">
      <h2>나의 독서 리듬과 책숲 도감</h2>
      <p>
        독서 기록·글쓰기·수업 활동을 남긴 날을 표시합니다. 학교 출결과는
        다릅니다. 쉬었다 돌아와도 이전 발견은 사라지지 않아요.
      </p>
      <form
        className="hub-inline"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run("rhythm_save", {
            target,
            revision: state.rhythm.revision,
          });
        }}
      >
        <label className="field">
          한 주에 기록을 남길 나의 목표
          <select
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                주 {n}일
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-outline"
          disabled={action.busy || action.blocked || state.classroom.archived}
        >
          나의 독서 리듬 저장
        </button>
      </form>
      <p>
        이번 주 {week}일 / 목표 {state.rhythm.target}일 · 지난 4주 참여{" "}
        {state.days.length}일
      </p>
      <div className="rhythm-calendar" aria-label="최근 28일 활동 달력">
        {Array.from({ length: 28 }, (_, i) => {
          const d = new Date(today + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() - 27 + i);
          const day = d.toISOString().slice(0, 10),
            active = state.days.includes(day);
          return (
            <span
              key={day}
              className={active ? "active" : ""}
              aria-label={day + " " + (active ? "활동 기록 있음" : "기록 없음")}
            >
              {d.getUTCDate()}
              <small>{active ? "●" : "·"}</small>
            </span>
          );
        })}
      </div>
      <p>목표·달력 자체로 경험치나 화폐가 추가 지급되지는 않습니다.</p>
      <div className="tool-grid">
        {forestDiscoveries.map((item, i) => {
          const Icon = icons[i],
            found = state.collection.includes(item.code),
            ready = (state.counts[item.kind] ?? 0) >= item.count;
          return (
            <article
              key={item.code}
              className={"forest-discovery " + (found ? "found" : "")}
            >
              <Icon size={44} aria-hidden="true" />
              <h3>
                {found
                  ? item.name
                  : "아직 발견하지 못한 " + (i + 1) + "번 장소"}
              </h3>
              <p>
                {activityLabels[item.kind]} {item.count}회 · 현재{" "}
                {state.counts[item.kind] ?? 0}회
              </p>
              <button
                className="button button-outline"
                disabled={
                  found ||
                  !ready ||
                  action.busy ||
                  action.blocked ||
                  state.classroom.archived
                }
                onClick={() =>
                  void action.run("collection_claim", { code: item.code })
                }
              >
                {found
                  ? "도감에 보관됨"
                  : ready
                    ? "새 장소 발견하기"
                    : "발견 조건 기다리기"}
              </button>
            </article>
          );
        })}
      </div>
      <p>
        도감은 확인된 기존 활동을 바탕으로 채워지며 별도 중복 보상은 발생하지
        않습니다.
      </p>
      <p role="status">{action.message}</p>
    </section>
  );
}
