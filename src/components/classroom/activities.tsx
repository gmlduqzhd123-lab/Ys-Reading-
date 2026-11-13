"use client";
import { useEffect, useState } from "react";
import type {
  ClassroomToolState,
  ClassActivity,
  ActivityAnswer,
} from "@/lib/classroom-tools";
import { formatOperationsDate } from "@/lib/operations";
import { downloadActivity } from "@/lib/activity-print";
import { useToolAction } from "./use-tool-action";
import { feedbackStarters } from "@/lib/participation";
function StudentActivity({
  owner,
  classroom,
  activity,
  previous,
  archived,
}: {
  owner: string;
  classroom: string;
  activity: ClassActivity;
  previous?: ActivityAnswer;
  archived: boolean;
}) {
  const action = useToolAction(owner, classroom),
    [answers, setAnswers] = useState<Record<string, string | number>>(
      previous?.status === "revision_requested" ? previous.answers : {},
    ),
    [step, setStep] = useState(0),
    [sent, setSent] = useState(false),
    quiz = activity.snapshot.kind === "quiz",
    questions = activity.snapshot.questions,
    closed =
      archived ||
      !activity.active ||
      (activity.due_at && Date.parse(activity.due_at) <= Date.now()),
    locked = sent || (!!previous && previous.status !== "revision_requested");
  useEffect(() => {
    if (action.blocked) setAnswers({});
  }, [action.blocked]);
  return (
    <article className="tool-card" id={"activity-" + activity.id}>
      <h3>{activity.snapshot.title}</h3>
      <p>{activity.snapshot.instructions}</p>
      <p>
        배부 버전 {activity.snapshot.revision}
        {activity.due_at
          ? " · 마감 " + formatOperationsDate(activity.due_at)
          : " · 마감 미지정"}
      </p>
      <button
        className="button button-outline"
        onClick={() => downloadActivity(activity)}
      >
        활동지 인쇄 파일
      </button>
      {previous && (
        <aside>
          <details>
            <summary>이 제출 버전 다시 읽기</summary>
            {questions.map((q) => (
              <div key={q.id}>
                <strong>{q.label}</strong>
                <p className="tool-writing">
                  {typeof previous.answers[q.id] === "number"
                    ? q.options?.[Number(previous.answers[q.id])]
                    : previous.answers[q.id]}
                </p>
              </div>
            ))}
            <button
              className="button button-outline"
              onClick={() => downloadActivity(activity, previous.answers)}
            >
              나의 제출본 인쇄 파일
            </button>
          </details>
          <p>
            나의 {previous.version}번째 제출 ·{" "}
            {
              {
                submitted: "선생님 확인 대기",
                revision_requested: "고쳐쓰기 요청",
                completed: "확인 완료",
              }[previous.status]
            }
          </p>
          {previous.feedback && <p>선생님 피드백: {previous.feedback}</p>}
          {previous.result.total !== undefined && (
            <>
              <p>
                퀴즈 결과 {previous.result.score} / {previous.result.total} ·
                점수는 교사 확인·보상과 별도입니다.
              </p>
              {previous.result.items?.map((x) => (
                <p key={x.id}>
                  {questions.find((q) => q.id === x.id)?.label} ·{" "}
                  {x.correct ? "확인했어요" : "다시 생각해 봐요"} ·{" "}
                  {x.explanation}
                </p>
              ))}
            </>
          )}
        </aside>
      )}
      {!closed && !locked && (
        <form
          data-tool-dirty={Object.keys(answers).length > 0}
          onSubmit={async (e) => {
            e.preventDefault();
            if (quiz && step < questions.length - 1) {
              setStep(step + 1);
              return;
            }
            if (
              await action.run("activity_submit", {
                id: activity.id,
                version: previous?.version ?? 0,
                answers,
              })
            ) {
              setSent(true);
              setAnswers({});
            }
          }}
        >
          <fieldset
            className="hub-fieldset"
            disabled={action.busy || action.blocked}
          >
            {quiz && (
              <>
                <p>
                  생각 다리 {step + 1} / {questions.length}
                </p>
                <progress
                  aria-label="퀴즈 진행"
                  max={questions.length}
                  value={step}
                />
              </>
            )}
            {questions.map((q, i) => (
              <div key={q.id} hidden={quiz && i !== step}>
                {q.kind === "choice" ? (
                  <fieldset>
                    <legend>{q.label}</legend>
                    {q.options?.map((v, n) => (
                      <label className="tool-choice" key={n}>
                        <input
                          type="radio"
                          name={q.id}
                          required={i === step}
                          checked={answers[q.id] === n}
                          onChange={() => setAnswers({ ...answers, [q.id]: n })}
                        />
                        {v}
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <label className="field">
                    {q.label}
                    <textarea
                      required
                      maxLength={2000}
                      value={String(answers[q.id] ?? "")}
                      onChange={(e) =>
                        setAnswers({ ...answers, [q.id]: e.target.value })
                      }
                    />
                  </label>
                )}
              </div>
            ))}
            <div className="button-row">
              {quiz && step > 0 && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setStep(step - 1)}
                >
                  앞 문제
                </button>
              )}
              <button className="button button-primary">
                {quiz && step < questions.length - 1
                  ? "다음 생각 다리"
                  : previous?.status === "revision_requested"
                    ? "고친 활동 제출"
                    : "활동 제출"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {closed && <p>종료되었거나 마감된 활동입니다.</p>}
      <p role="status">
        {sent
          ? "제출했어요. 제출한 내용은 해당 버전으로 보존되며 선생님의 확인을 기다립니다."
          : action.message}
      </p>
    </article>
  );
}
function ReviewAnswer({
  owner,
  state,
  answer,
}: {
  owner: string;
  state: ClassroomToolState;
  answer: ActivityAnswer;
}) {
  const action = useToolAction(owner, state.classroom.id),
    [feedback, setFeedback] = useState(""),
    activity = state.activities.find((a) => a.id === answer.activity_id);
  return (
    <article className="tool-card">
      <h4>
        {answer.student_name} · {activity?.snapshot.title ?? "배부 활동"} ·{" "}
        {answer.version}번째 제출
      </h4>
      {Object.entries(answer.answers).map(([id, value]) => (
        <p key={id}>
          <strong>
            {activity?.snapshot.questions.find((q) => q.id === id)?.label ?? id}
          </strong>
          <br />
          {typeof value === "number"
            ? (activity?.snapshot.questions.find((q) => q.id === id)?.options?.[
                value
              ] ?? "선택 " + (value + 1))
            : value}
        </p>
      ))}
      <button
        className="button button-outline"
        onClick={() => activity && downloadActivity(activity, answer.answers)}
        disabled={!activity}
      >
        제출본 인쇄 파일
      </button>
      {answer.status === "submitted" &&
      state.classroom.canReview &&
      !state.classroom.archived ? (
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="button-row">
            {feedbackStarters.map((text, i) => (
              <button
                type="button"
                key={i}
                className="button button-outline"
                onClick={() => setFeedback(text)}
              >
                피드백 시작 문구 {i + 1}
              </button>
            ))}
          </div>
          <label className="field">
            {answer.student_name}에게 피드백
            <textarea
              maxLength={2000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              disabled={!feedback.trim() || action.busy || action.blocked}
              className="button button-primary"
              onClick={() =>
                void action.run("activity_review", {
                  id: answer.id,
                  status: "completed",
                  feedback,
                })
              }
            >
              활동 확인·보상 반영
            </button>
            <button
              disabled={!feedback.trim() || action.busy || action.blocked}
              className="button button-outline"
              onClick={() =>
                void action.run("activity_review", {
                  id: answer.id,
                  status: "revision_requested",
                  feedback,
                })
              }
            >
              고쳐쓰기 요청
            </button>
          </div>
        </form>
      ) : (
        <p>
          {answer.status === "completed"
            ? "확인 완료"
            : answer.status === "revision_requested"
              ? "고쳐쓰기 요청"
              : "확인 대기"}{" "}
          · {answer.feedback}
        </p>
      )}
      <p role="status">{action.message}</p>
    </article>
  );
}
function PaperConfirmation({
  owner,
  state,
}: {
  owner: string;
  state: ClassroomToolState;
}) {
  const action = useToolAction(owner, state.classroom.id),
    [activity, setActivity] = useState(state.activities[0]?.id ?? ""),
    [student, setStudent] = useState(state.today[0]?.id ?? ""),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <details className="tool-card">
      <summary>종이로 제출한 활동 확인 기록</summary>
      <p>
        학생의 온라인 제출본을 대신 만들지 않고 교사가 확인한 사실·피드백만
        별도로 기록합니다. 같은 활동의 온라인 확인과 보상은 중복 지급하지
        않습니다.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await action.run("paper_confirm", {
              activity,
              student,
              note,
              confirmed,
            })
          ) {
            setNote("");
            setConfirmed(false);
          }
        }}
      >
        <fieldset
          className="hub-fieldset"
          disabled={action.busy || action.blocked || state.classroom.archived}
        >
          <label className="field">
            종이로 확인할 배부 활동
            <select
              aria-label="종이로 확인할 배부 활동"
              required
              value={activity}
              onChange={(e) => {
                setActivity(e.target.value);
                setConfirmed(false);
              }}
            >
              {state.activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.snapshot.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            종이 활동을 제출한 학생
            <select
              aria-label="종이 활동을 제출한 학생"
              required
              value={student}
              onChange={(e) => {
                setStudent(e.target.value);
                setConfirmed(false);
              }}
            >
              {state.today.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            종이 활동 관찰·피드백
            <textarea
              required
              maxLength={2000}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label className="tool-choice">
            <input
              required
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            해당 학생의 종이 활동을 직접 확인했으며 관찰 사실만 기록합니다.
          </label>
          <button
            className="button button-primary"
            disabled={!activity || !student || !confirmed}
          >
            종이 활동 확인 기록 저장
          </button>
        </fieldset>
      </form>
      <p role="status">{action.message}</p>
    </details>
  );
}
export function ClassroomActivities({
  owner,
  state,
  student,
}: {
  owner: string;
  state: ClassroomToolState;
  student: boolean;
}) {
  const action = useToolAction(owner, state.classroom.id);
  return (
    <section className="panel" id="activities">
      <h2>
        {student ? "우리 반 활동·생각 다리" : "배부한 활동·확인할 제출본"}
      </h2>
      {!student && state.classroom.canReview && (
        <PaperConfirmation owner={owner} state={state} />
      )}
      {(state.papers ?? []).map((p) => (
        <article className="tool-card" key={p.activity_id + p.student_id}>
          <h3>{p.title} · 종이 활동 확인</h3>
          <p>{student ? "나의 종이 활동" : p.student_name} · 교사 기록</p>
          <p className="tool-writing">{p.note}</p>
        </article>
      ))}
      <p>
        최근 배부 활동 20개 · 전체 {state.activityTotal}개. 제출본은 버전으로
        보존합니다. 교사 확인이 완료된 활동만 학급 보상 기준에 따라 한 번
        반영됩니다.
      </p>
      {!state.activities.length && <p>아직 배부된 활동이 없어요.</p>}
      {state.activities.map((a) =>
        student ? (
          <StudentActivity
            archived={state.classroom.archived}
            key={
              a.id +
              ":" +
              (state.answers.find((w) => w.activity_id === a.id)?.version ??
                0) +
              ":" +
              (state.answers.find((w) => w.activity_id === a.id)?.status ?? "")
            }
            owner={owner}
            classroom={state.classroom.id}
            activity={a}
            previous={state.answers.find((w) => w.activity_id === a.id)}
          />
        ) : (
          <article className="tool-card" key={a.id}>
            <h3>{a.snapshot.title}</h3>
            <p>
              {a.snapshot.kind === "quiz" ? "교사 확인 퀴즈" : "활동지"} · 배부
              버전 {a.snapshot.revision} · {a.active ? "진행" : "종료"}
            </p>
            <button
              className="button button-outline"
              onClick={() => downloadActivity(a)}
            >
              활동지 인쇄 파일
            </button>
            {state.classroom.owner && a.active && (
              <button
                disabled={
                  action.busy || action.blocked || state.classroom.archived
                }
                className="button button-outline"
                onClick={() => void action.run("activity_close", { id: a.id })}
              >
                이 활동 마감
              </button>
            )}
          </article>
        ),
      )}
      {!student &&
        state.answers.map((w) => (
          <ReviewAnswer
            key={w.id + ":" + w.status}
            owner={owner}
            state={state}
            answer={w}
          />
        ))}
      <p role="status">{action.message}</p>
    </section>
  );
}
