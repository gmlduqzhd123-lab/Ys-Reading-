"use client";
import { useState } from "react";
import {
  worksheetStarters,
  type ActivityQuestion,
  type ActivityTemplate,
  type ClassroomToolState,
} from "@/lib/classroom-tools";
import { useToolAction } from "./use-tool-action";
import { downloadActivity } from "@/lib/activity-print";
import { quizDraft } from "@/app/classroom/quiz-actions";
export function ActivityEditor({
  owner,
  state,
  aiReady,
}: {
  owner: string;
  state: ClassroomToolState;
  aiReady: boolean;
}) {
  const action = useToolAction(owner, state.classroom.id),
    [id, setId] = useState<string | undefined>(),
    [revision, setRevision] = useState(0),
    [title, setTitle] = useState("인물 인터뷰"),
    [instructions, setInstructions] = useState(
      "책 속 장면을 떠올리고 나의 생각을 남겨 보세요.",
    ),
    [kind, setKind] = useState<"worksheet" | "quiz">("worksheet"),
    [questions, setQuestions] = useState<ActivityQuestion[]>(
      worksheetStarters[0].labels.map((label, i) => ({
        id: "q" + (i + 1),
        label,
        kind: "text",
      })),
    ),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState(false),
    [assign, setAssign] = useState<ActivityTemplate | null>(null),
    [due, setDue] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [shareConfirmed, setShareConfirmed] = useState(false),
    [source, setSource] = useState(""),
    [aiBusy, setAiBusy] = useState(false),
    [aiConsent, setAiConsent] = useState(false),
    [aiMessage, setAiMessage] = useState("");
  function load(t: ActivityTemplate) {
    if (
      dirty &&
      !window.confirm("저장하지 않은 편집 내용이 있어요. 다른 양식을 열까요?")
    )
      return;
    setId(t.id);
    setRevision(t.revision);
    setTitle(t.title);
    setInstructions(t.instructions);
    setKind(t.kind);
    setQuestions(t.questions);
    setDirty(false);
    setPreview(false);
  }
  function editQuestion(i: number, q: ActivityQuestion) {
    setQuestions(questions.map((x, n) => (n === i ? q : x)));
    setDirty(true);
  }
  const draft = {
    id: "preview",
    active: true,
    due_at: null,
    created_at: "",
    snapshot: { title, instructions, kind, questions, revision: revision || 1 },
  };
  return (
    <section className="panel" id="maker">
      <h2>우리 반 활동지·퀴즈 제작실</h2>
      <p>
        같은 배부 버전으로 온라인 활동과 A4 인쇄를 준비합니다. 편집 후 다시
        배부해도 이전 학생의 활동·제출본은 유지됩니다.
      </p>
      <form
        data-tool-dirty={dirty}
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await action.run("template_save", {
            ...(id ? { id } : {}),
            revision,
            title,
            instructions,
            kind,
            questions,
          });
          if (r) {
            setId(String(r.id));
            setRevision(Number(r.revision));
            setDirty(false);
          }
        }}
      >
        <fieldset
          className="hub-fieldset"
          disabled={
            action.busy || aiBusy || action.blocked || state.classroom.archived
          }
        >
          <label className="field">
            시작 양식
            <select
              aria-label="시작 양식"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                const t = worksheetStarters[Number(e.target.value)];
                setId(undefined);
                setRevision(0);
                setTitle(t.title);
                setKind("worksheet");
                setQuestions(
                  t.labels.map((label, i) => ({
                    id: "q" + (i + 1),
                    label,
                    kind: "text",
                  })),
                );
                setDirty(true);
              }}
            >
              <option value="">양식을 골라 편집하기</option>
              {worksheetStarters.map((t, i) => (
                <option key={t.title} value={i}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            활동 종류
            <select
              aria-label="활동 종류"
              value={kind}
              onChange={(e) => {
                const k = e.target.value as "worksheet" | "quiz";
                setKind(k);
                setQuestions(
                  questions.map((q) =>
                    k === "quiz"
                      ? {
                          ...q,
                          kind: "choice",
                          options: q.options ?? ["선택지 1", "선택지 2"],
                          answer: q.answer ?? 0,
                          explanation: q.explanation ?? "",
                        }
                      : { id: q.id, label: q.label, kind: "text" },
                  ),
                );
                setDirty(true);
              }}
            >
              <option value="worksheet">생각을 쓰는 활동지</option>
              <option value="quiz">생각 다리 퀴즈</option>
            </select>
          </label>
          <label className="field">
            활동 제목
            <input
              required
              maxLength={100}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label className="field">
            학생에게 안내
            <textarea
              maxLength={3000}
              value={instructions}
              onChange={(e) => {
                setInstructions(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          {questions.map((q, i) => (
            <fieldset className="tool-question" key={q.id}>
              <legend>{i + 1}번 질문</legend>
              <label className="field">
                질문 내용
                <input
                  required
                  maxLength={500}
                  value={q.label}
                  onChange={(e) =>
                    editQuestion(i, { ...q, label: e.target.value })
                  }
                />
              </label>
              {kind === "quiz" && (
                <>
                  {q.options?.map((v, n) => (
                    <label className="field" key={n}>
                      선택지 {n + 1}
                      <input
                        required
                        maxLength={200}
                        value={v}
                        onChange={(e) =>
                          editQuestion(i, {
                            ...q,
                            options: q.options?.map((x, j) =>
                              j === n ? e.target.value : x,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <label className="field">
                    정답
                    <select
                      aria-label="정답"
                      value={q.answer ?? 0}
                      onChange={(e) =>
                        editQuestion(i, {
                          ...q,
                          answer: Number(e.target.value),
                        })
                      }
                    >
                      {q.options?.map((_, n) => (
                        <option key={n} value={n}>
                          {n + 1}번
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    정답 근거·해설
                    <textarea
                      required
                      maxLength={1000}
                      value={q.explanation ?? ""}
                      onChange={(e) =>
                        editQuestion(i, { ...q, explanation: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              <button
                type="button"
                className="button button-outline"
                disabled={questions.length === 1}
                onClick={() => {
                  setQuestions(questions.filter((_, n) => n !== i));
                  setDirty(true);
                }}
              >
                이 질문 지우기
              </button>
            </fieldset>
          ))}
          <div className="button-row">
            <button
              type="button"
              className="button button-outline"
              disabled={questions.length >= 10}
              onClick={() => {
                setQuestions([
                  ...questions,
                  {
                    id:
                      "q" +
                      crypto.randomUUID().replaceAll("-", "").slice(0, 10),
                    label: "",
                    kind: kind === "quiz" ? "choice" : "text",
                    ...(kind === "quiz"
                      ? { options: ["", ""], answer: 0, explanation: "" }
                      : {}),
                  },
                ]);
                setDirty(true);
              }}
            >
              질문 더하기
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => setPreview(!preview)}
            >
              학생 활동 미리보기
            </button>
            <button className="button button-primary">
              활동 양식 서버에 저장
            </button>
          </div>
        </fieldset>
      </form>
      {preview && (
        <aside
          className="tool-preview"
          aria-label="작성 중인 활동 학생 미리보기"
        >
          <strong>시연 · 실제 제출·보상은 발생하지 않아요</strong>
          <h3>{title}</h3>
          <p>{instructions}</p>
          {questions.map((q) => (
            <div key={q.id}>
              <p>{q.label}</p>
              {q.options?.map((v) => (
                <p key={v}>○ {v}</p>
              ))}
            </div>
          ))}
          <button
            className="button button-outline"
            onClick={() => downloadActivity(draft)}
          >
            이 편집본 인쇄 파일
          </button>
        </aside>
      )}
      {kind === "quiz" && (
        <details>
          <summary>AI로 문제 초안 준비</summary>
          <p>
            직접 작성했거나 이용할 권한이 있는 짧은 설명만 입력하세요. 학생
            글·이름은 보내지 않습니다. 생성 결과는 검토 후 양식에 저장하고
            별도로 배부합니다.
          </p>
          <label className="field">
            문제의 근거가 될 설명
            <textarea
              maxLength={3000}
              value={source}
              disabled={aiBusy || action.blocked}
              onChange={(e) => {
                setSource(e.target.value);
                setAiConsent(false);
              }}
            />
          </label>
          <label className="tool-choice">
            <input
              type="checkbox"
              checked={aiConsent}
              disabled={aiBusy || action.blocked}
              onChange={(e) => setAiConsent(e.target.checked)}
            />
            학생 정보가 없는 위 설명을 외부 AI 서비스에 보내 문제 초안을 만드는
            데 동의합니다.
          </label>
          <button
            type="button"
            className="button button-outline"
            disabled={
              !aiReady ||
              !aiConsent ||
              aiBusy ||
              action.blocked ||
              source.trim().length < 30
            }
            onClick={async () => {
              setAiBusy(true);
              try {
                const r = await quizDraft({
                  owner,
                  classroom: state.classroom.id,
                  source,
                  confirmed: aiConsent,
                });
                if (r.ok) {
                  setQuestions(r.questions);
                  setDirty(true);
                }
                setAiMessage(r.message);
              } catch {
                setAiMessage(
                  "연결을 확인하고 다시 시도해 주세요. 입력은 유지됩니다.",
                );
              } finally {
                setAiBusy(false);
              }
            }}
          >
            AI 퀴즈 초안 만들기
          </button>
          <p role="status">
            {aiReady
              ? aiMessage
              : "AI 연결 설정 대기입니다. 직접 문제·정답·해설을 작성해 모든 퀴즈 기능을 사용할 수 있어요."}
          </p>
        </details>
      )}
      <p role="status">{action.message}</p>
      <h3>나의 양식·교사 공유 양식 · 최근 20개</h3>
      <label className="tool-choice">
        <input
          type="checkbox"
          checked={shareConfirmed}
          onChange={(e) => setShareConfirmed(e.target.checked)}
        />
        내가 공유할 권한이 있는 질문·양식이며 학생의 글·사진이 포함되지 않았음을
        확인합니다.
      </label>
      <div className="tool-grid">
        {state.templates.map((t) => (
          <article className="tool-card" key={t.id}>
            <h4>{t.title}</h4>
            <p>
              {t.kind === "quiz" ? "퀴즈" : "활동지"} · {t.revision}판 ·{" "}
              {t.owned ? "내 양식" : "공유 양식"}
            </p>
            {t.owned ? (
              <>
                <button
                  className="button button-outline"
                  onClick={() => load(t)}
                >
                  이 양식 편집
                </button>
                <button
                  className="button button-outline"
                  disabled={
                    action.busy || action.blocked || state.classroom.archived
                  }
                  onClick={() => {
                    setAssign(t);
                    setConfirmed(false);
                  }}
                >
                  학급 배부 내용 확인
                </button>
                <button
                  className="button button-outline"
                  disabled={
                    action.busy ||
                    action.blocked ||
                    (!t.published && !shareConfirmed) ||
                    state.classroom.archived
                  }
                  onClick={() =>
                    void action.run("template_publish", {
                      id: t.id,
                      revision: t.revision,
                      published: !t.published,
                      confirmed: shareConfirmed,
                    })
                  }
                >
                  {t.published ? "양식 공유 해제" : "교사 갤러리에 양식 공유"}
                </button>
              </>
            ) : (
              <button
                className="button button-outline"
                disabled={
                  action.busy || action.blocked || state.classroom.archived
                }
                onClick={() => void action.run("template_clone", { id: t.id })}
              >
                내 양식으로 복제
              </button>
            )}
          </article>
        ))}
      </div>
      {assign && (
        <div className="tool-preview">
          <h3>학급 배부 최종 확인</h3>
          <p>
            {state.classroom.name} · {assign.title} · {assign.revision}판 ·{" "}
            {assign.questions.length}문항
          </p>
          <label className="field">
            마감 시각 · 한국 시간 · 비우면 기한 없음
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          {assign.kind === "quiz" && (
            <label className="tool-choice">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              문제·정답·해설의 근거와 학생에게 적절한 내용임을 직접
              확인했습니다.
            </label>
          )}
          <button
            className="button button-primary"
            disabled={
              action.busy ||
              action.blocked ||
              (assign.kind === "quiz" && !confirmed)
            }
            onClick={async () => {
              if (
                await action.run("activity_assign", {
                  template: assign.id,
                  revision: assign.revision,
                  dueAt: due ? new Date(due + "+09:00").toISOString() : "",
                  confirmed,
                })
              )
                setAssign(null);
            }}
          >
            확인하고 우리 반에 배부
          </button>
          <button
            className="button button-outline"
            onClick={() => setAssign(null)}
          >
            배부 취소
          </button>
        </div>
      )}
    </section>
  );
}
