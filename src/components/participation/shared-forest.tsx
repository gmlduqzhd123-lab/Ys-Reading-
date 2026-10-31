"use client";
import { TreePine, Flower2, LibraryBig } from "lucide-react";
import { koreanDay } from "@/lib/hub";
import type { HubData } from "@/lib/hub-data";
import type { ParticipationData } from "@/lib/participation";
import { ClassField, Field, Panel } from "@/components/hub/shared";
import { ParticipationForm, iso, value } from "./form";
export function SharedForest({
  hub,
  extra,
}: {
  hub: HubData;
  extra: ParticipationData;
}) {
  const teacher = hub.profile.role === "teacher";
  return (
    <>
      <Panel title="함께 키우는 우리 반 책숲">
        <p>
          목표를 만든 이후 선생님이 확인한 독서·미션·고쳐쓰기가 숲을 키웁니다.
          순위 대신 함께 이룬 변화를 살펴보세요.
        </p>
        {!extra.goals.length && (
          <div className="hub-empty">
            선생님이 첫 공동 목표를 정하면 우리 반 숲이 자라기 시작해요.
          </div>
        )}
        {extra.goals.map((g) => {
          const percent = Math.min(
              100,
              Math.floor((g.progress / g.target) * 100),
            ),
            stage = percent >= 100 ? 2 : percent >= 50 ? 1 : 0;
          const names = ["새싹 오솔길", "책나무 쉼터", "꽃피는 도서관"];
          return (
            <article className="shared-forest-card" key={g.id}>
              <div
                className={`forest-landscape stage-${stage}`}
                aria-label={names[stage]}
              >
                <TreePine size={44} />
                <TreePine size={72} />
                {stage === 2 ? (
                  <LibraryBig size={54} />
                ) : (
                  <TreePine size={54} />
                )}
                <Flower2 size={stage === 2 ? 44 : 25} />
              </div>
              <small>
                {hub.classes.find((c) => c.id === g.classroom_id)?.name ??
                  "우리 반"}{" "}
                ·{" "}
                {new Date(g.ends_at).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
                까지
              </small>
              <h3>{g.title}</h3>
              <p>
                <strong>
                  {g.progress} / {g.target}
                </strong>{" "}
                · {names[stage]}
              </p>
              <progress
                aria-label={g.title + " 공동 달성률"}
                value={Math.min(g.progress, g.target)}
                max={g.target}
              />
              <p>
                확인된{" "}
                {g.kind === "reading"
                  ? "독서 기록"
                  : g.kind === "revision"
                    ? "고쳐쓰기"
                    : "미션 완료"}
                가 모인 결과예요.
              </p>
              {!teacher &&
                (g.claimed ? (
                  <p className="status-pill completed">
                    🌳 함께 자란 책숲 배지 획득
                  </p>
                ) : (
                  <>
                    <p>
                      나의 참여 {g.mine}회 · 목표를 함께 이루고 한 번 이상
                      참여하면 배지를 받아요.
                    </p>
                    {g.progress >= g.target && g.mine > 0 && (
                      <ParticipationForm
                        command="goal_claim"
                        label="함께 자란 책숲 배지 받기"
                        payload={() => ({ id: g.id })}
                      />
                    )}
                  </>
                ))}
            </article>
          );
        })}
        <p className="form-help">최근 공동 목표 최대 100개를 표시합니다.</p>
      </Panel>
      {teacher && hub.classes.length > 0 && (
        <details className="panel">
          <summary>우리 반 공동 목표 만들기</summary>
          <ParticipationForm
            command="goal_create"
            label="새 공동 목표 시작"
            payload={(fd) => ({
              classroomId: value(fd, "classroomId"),
              title: value(fd, "title"),
              kind: value(fd, "kind"),
              target: Number(value(fd, "target")),
              endsAt: iso(fd, "endsAt"),
            })}
          >
            <ClassField classes={hub.classes} />
            <Field
              name="title"
              label="목표 이름"
              maxLength={80}
              defaultValue="우리 반 생각의 숲 키우기"
            />
            <label className="field">
              함께 모을 활동
              <select name="kind">
                <option value="reading">선생님이 확인한 완독 기록</option>
                <option value="mission">미션 완료</option>
                <option value="revision">피드백 반영·고쳐쓰기 완료</option>
              </select>
            </label>
            <Field
              name="target"
              label="공동 목표 횟수"
              type="number"
              min={1}
              max={1000}
              defaultValue={30}
            />
            <Field
              name="endsAt"
              label="목표 마감일"
              type="date"
              min={koreanDay()}
              defaultValue={koreanDay(new Date(Date.now() + 7 * 86400000))}
            />
          </ParticipationForm>
        </details>
      )}
    </>
  );
}
