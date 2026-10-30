"use client";
import { useState } from "react";
import { missions, themes } from "@/lib/missions";
import { reviewDemo, sampleDraft, sampleStory, submitDemo } from "@/lib/studio";
import { Field, Panel, type ToolProps } from "./shared";
const defaultFeedback =
  "모모가 망설인 까닭을 책의 장면과 연결하면 마음이 더 잘 전해지겠어요.";

export function DemoRoom({ state, update, go }: ToolProps) {
  const [role, setRole] = useState<"student" | "teacher">("teacher");
  const [feedback, setFeedback] = useState(defaultFeedback);
  const d = state.demo,
    mission = missions.find((m) => m.id === d.missionId)!;
  const latest = d.versions.at(-1);
  const edit = (key: "title" | "body" | "reason", value: string) =>
    update((s) => ({ ...s, demo: { ...s.demo, [key]: value } }));
  return (
    <>
      <div className="studio-role" aria-label="체험 역할">
        <button
          className={`button ${role === "teacher" ? "button-primary" : "button-outline"}`}
          aria-pressed={role === "teacher"}
          onClick={() => setRole("teacher")}
        >
          선생님 역할
        </button>
        <button
          className={`button ${role === "student" ? "button-primary" : "button-outline"}`}
          aria-pressed={role === "student"}
          onClick={() => setRole("student")}
        >
          학생 역할
        </button>
        <span>가상 학생 ‘새싹’과 가상 교사 ‘숲지기’의 체험 교실</span>
      </div>
      <details className="panel sample-story">
        <summary>체험용 짧은 이야기 · 작은 씨앗의 약속</summary>
        <p>{sampleStory}</p>
        <small>책숲에서 직접 만든 체험용 이야기입니다.</small>
      </details>
      {role === "teacher" ? (
        <div className="studio-two-col">
          <Panel
            title="1. 미션 배정"
            intro="선생님이 미션을 배정한 뒤 학생 역할로 바꾸어 글을 써 보세요."
          >
            <label className="studio-field">
              <span>체험 미션 선택</span>
              <select
                value={d.missionId}
                disabled={d.assigned}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    demo: { ...s.demo, missionId: e.target.value },
                  }))
                }
              >
                {missions.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.title} · {m.grade_band}학년
                  </option>
                ))}
              </select>
            </label>
            <p>{mission.prompt}</p>
            <small>
              {themes[mission.theme].label} ·{" "}
              {mission.requires_revision
                ? "피드백 후 고쳐 쓰는 미션"
                : "생각을 표현하는 미션"}
            </small>
            <div className="button-row">
              <button
                className="button button-primary"
                disabled={d.assigned}
                onClick={() =>
                  update(
                    (s) => ({ ...s, demo: { ...s.demo, assigned: true } }),
                    "체험 미션을 배정했어요. 학생 역할로 바꿔 보세요.",
                  )
                }
              >
                {d.assigned ? "체험 미션 배정됨" : "새싹에게 체험 미션 배정"}
              </button>
            </div>
            {d.assigned && (
              <p className="form-help">
                체험 교실은 한 미션을 끝까지 진행해요. 다른 미션으로 처음부터
                시작하려면 상단의 체험 초기화를 이용해 주세요.
              </p>
            )}
          </Panel>
          <Panel
            title="2. 버전별 피드백"
            intro="수정 요청 → 학생의 수정본 → 완료 순서로 체험할 수 있어요."
          >
            {!latest ? (
              <p className="empty-state">학생이 제출하면 여기에 나타나요.</p>
            ) : (
              <>
                <h3>
                  {latest.version}번째 글 · {latest.title}
                </h3>
                <p className="studio-writing">{latest.body}</p>
                {latest.reason && <p>학생의 수정 이유: {latest.reason}</p>}
                {latest.status === "submitted" ? (
                  <>
                    <Field
                      label="체험 피드백"
                      area
                      max={1500}
                      value={feedback}
                      onChange={setFeedback}
                    />
                    <div className="button-row">
                      <button
                        className="button button-outline"
                        onClick={() =>
                          update(
                            (s) =>
                              reviewDemo(
                                s,
                                "revision_requested",
                                feedback,
                                new Date().toISOString(),
                              ),
                            "수정 요청을 남겼어요. 학생 역할에서 고쳐 보세요.",
                          )
                        }
                      >
                        수정 요청 보내기
                      </button>
                      <button
                        className="button button-primary"
                        onClick={() =>
                          update(
                            (s) =>
                              reviewDemo(
                                s,
                                "completed",
                                feedback,
                                new Date().toISOString(),
                              ),
                            "체험 미션을 완료했어요. 작품 보관함과 생각나무에 반영했어요.",
                          )
                        }
                      >
                        체험 미션 완료
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="notice">
                    <strong>
                      {latest.status === "completed"
                        ? "완료된 글이에요"
                        : "수정 요청을 보냈어요"}
                    </strong>
                    <p>{latest.feedback}</p>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      ) : (
        <Panel
          title="새싹의 글쓰기"
          intro={
            d.assigned
              ? mission.prompt
              : "선생님 역할에서 미션을 먼저 배정해 주세요."
          }
        >
          <fieldset disabled={!d.assigned} className="studio-fieldset">
            <div className="button-row">
              <button
                className="button button-outline"
                disabled={Boolean(d.title || d.body)}
                onClick={() =>
                  update(
                    (s) => ({ ...s, demo: { ...s.demo, ...sampleDraft } }),
                    "체험 초고를 불러왔어요. 내 말로 바꿔 써 보세요.",
                  )
                }
              >
                예시 초고 불러오기
              </button>
              <button
                className="button button-outline"
                onClick={() => go("cards")}
              >
                글쓰기 카드 열기
              </button>
            </div>
            <Field
              label="체험 글 제목"
              value={d.title}
              onChange={(v) => edit("title", v)}
            />
            <Field
              label="체험 글 본문"
              value={d.body}
              onChange={(v) => edit("body", v)}
              area
              max={10000}
              rows={8}
            />
            {latest?.feedback && (
              <div className="notice">
                <strong>{latest.version}번째 글의 피드백</strong>
                <p>{latest.feedback}</p>
              </div>
            )}
            {latest && (
              <Field
                label="고친 부분과 그 이유"
                value={d.reason}
                onChange={(v) => edit("reason", v)}
                area
                max={1000}
              />
            )}
            <button
              className="button button-primary"
              disabled={latest?.status === "submitted"}
              onClick={() =>
                update(
                  (s) =>
                    submitDemo(
                      s,
                      crypto.randomUUID(),
                      new Date().toISOString(),
                    ),
                  "체험 제출본을 이 브라우저에 보관했어요. 선생님 역할에서 확인해 주세요.",
                )
              }
            >
              {latest?.status === "submitted"
                ? "체험 피드백을 기다려요"
                : latest
                  ? "수정본 체험 제출"
                  : "초고 체험 제출"}
            </button>
          </fieldset>
          <p className="form-help">
            입력은 이 브라우저에 기록돼요. 실제 선생님에게 전송되지 않아요.
          </p>
          <div className="button-row">
            <button
              className="button button-outline"
              onClick={() => go("compare")}
            >
              초고·수정본 비교하기
            </button>
            <button
              className="button button-outline"
              onClick={() => go("festival")}
            >
              글쓰기 대회 준비하기
            </button>
          </div>
        </Panel>
      )}
      <Panel title="체험 제출 기록">
        {!d.versions.length ? (
          <p>첫 글을 제출하면 버전 기록이 시작돼요.</p>
        ) : (
          d.versions.toReversed().map((v) => (
            <details key={v.id} className="studio-history">
              <summary>
                {v.version}번째 글 · {v.title} ·{" "}
                {v.status === "submitted"
                  ? "검토 대기"
                  : v.status === "revision_requested"
                    ? "수정 요청"
                    : "완료"}
              </summary>
              <p className="studio-writing">{v.body}</p>
              {v.feedback && <p>피드백: {v.feedback}</p>}
              {v.reason && <p>고친 이유: {v.reason}</p>}
            </details>
          ))
        )}
      </Panel>
    </>
  );
}
