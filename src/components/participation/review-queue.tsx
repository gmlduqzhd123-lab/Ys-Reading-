"use client";
import { useState } from "react";
import Link from "next/link";
import type { DashboardData } from "@/lib/data";
import type { HubData } from "@/lib/hub-data";
import type { ParticipationData } from "@/lib/participation";
import { feedbackStarters } from "@/lib/participation";
import { ParticipationForm, TextArea, value } from "./form";
import { Field } from "@/components/hub/shared";
export function ReviewQueue({
  data,
  hub,
  extra,
}: {
  data: DashboardData;
  hub: HubData;
  extra: ParticipationData;
}) {
  const [kind, setKind] = useState("writing"),
    [classId, setClassId] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [opened, setOpened] = useState<Set<string>>(new Set());
  const [body, setBody] = useState(""),
    [decision, setDecision] = useState("completed"),
    [page, setPage] = useState(0);
  const [notice, setNotice] = useState("");
  const latest = data.submissions.filter(
    (s) =>
      s.status === "submitted" &&
      !data.submissions.some(
        (n) =>
          n.assignment_id === s.assignment_id &&
          n.student_id === s.student_id &&
          n.version > s.version,
      ),
  );
  const writing = latest.map((s) => ({
    ...s,
    classroom_id:
      data.assignments.find((a) => a.id === s.assignment_id)?.classroom_id ??
      "",
    kind: "writing",
  }));
  const reading = hub.logs
    .filter((l) => l.status === "completed" && !l.verified_at)
    .map((l) => ({
      ...l,
      title: l.book.title,
      body:
        l.thought + (l.question ? "\n더 생각해 볼 질문: " + l.question : ""),
      version: 0,
      kind: "reading",
    }));
  const queue = (kind === "writing" ? writing : reading).filter(
    (r) => !classId || r.classroom_id === classId,
  );
  const reset = () => {
    setSelected([]);
    setPage(0);
  };
  return (
    <div className="review-queue">
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <h2>학생 기록 확인</h2>
      <p>
        작품을 펼쳐 읽은 뒤 ‘읽고 확인했어요’를 선택하세요. 한 번에 20건까지
        처리하며, 글쓰기 완료 보상은 기존 규칙에 따라 한 번만 지급됩니다.
      </p>
      <div className="today-actions">
        <div>
          <strong>{writing.length}</strong>
          <span>새 글·재제출 확인 대기</span>
        </div>
        <div>
          <strong>
            {reading.length}
            {hub.hasNext ? "+" : ""}
          </strong>
          <span>이 페이지의 완독 확인 대기</span>
        </div>
        <div>
          <strong>
            {
              data.submissions.filter(
                (s) =>
                  s.status === "revision_requested" &&
                  !data.submissions.some(
                    (n) =>
                      n.assignment_id === s.assignment_id &&
                      n.student_id === s.student_id &&
                      n.version > s.version,
                  ),
              ).length
            }
          </strong>
          <span>학생의 고쳐쓰기 기다림</span>
        </div>
      </div>
      <div className="hub-inline">
        <label className="field">
          기록 종류
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              reset();
            }}
          >
            <option value="writing">글쓰기 · 최신 제출만</option>
            <option value="reading">완독 기록 · 아직 확인하지 않은 것</option>
          </select>
        </label>
        <label className="field">
          학급 필터
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              reset();
            }}
          >
            <option value="">모든 담당 학급</option>
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!queue.length && (
        <div className="hub-empty">현재 확인할 기록이 없어요.</div>
      )}
      {queue.slice(page * 20, page * 20 + 20).map((r) => (
        <article key={r.id} className="review-card">
          <details
            onToggle={(e) => {
              if (e.currentTarget.open)
                setOpened((old) => new Set([...old, r.id]));
            }}
          >
            <summary>
              {hub.students.find((s) => s.id === r.student_id)?.display_name ??
                "학생"}{" "}
              · {r.title}
              {r.version ? ` · ${r.version}번째 글` : " · 독서 기록"}
            </summary>
            <p className="submission-body">{r.body}</p>
            {r.kind === "writing" && (
              <Link href={`/app?view=feedback`}>
                제출 이력·이전 피드백 보기
              </Link>
            )}
          </details>
          <label className="hub-check">
            <input
              type="checkbox"
              checked={selected.includes(r.id)}
              disabled={
                !opened.has(r.id) ||
                (!selected.includes(r.id) && selected.length >= 20)
              }
              onChange={(e) =>
                setSelected((old) =>
                  e.target.checked
                    ? [...old, r.id]
                    : old.filter((id) => id !== r.id),
                )
              }
            />
            이 기록을 읽고 확인했어요
          </label>
        </article>
      ))}
      <div className="button-row">
        <button
          className="button button-outline"
          disabled={!page}
          onClick={() => {
            setPage((p) => p - 1);
            setSelected([]);
          }}
        >
          이전 묶음
        </button>
        <span>
          {page + 1}묶음 · {queue.length}건
        </span>
        <button
          className="button button-outline"
          disabled={(page + 1) * 20 >= queue.length}
          onClick={() => {
            setPage((p) => p + 1);
            setSelected([]);
          }}
        >
          다음 묶음
        </button>
      </div>
      {selected.length > 0 && (
        <section className="panel">
          <h3>선택한 {selected.length}건 처리</h3>
          {kind === "writing" && (
            <>
              <label className="field">
                피드백 문구 불러오기
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) setBody(e.target.value);
                  }}
                >
                  <option value="">
                    문구를 고른 뒤 학생에 맞게 수정하세요
                  </option>
                  {[
                    ...feedbackStarters,
                    ...extra.presets.map((p) => p.body),
                  ].map((text, i) => (
                    <option key={i} value={text}>
                      {text.slice(0, 55)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                선택한 학생 모두에게 아래 문구가 전달됩니다. 서로 다른 피드백이
                필요하면 개별로 처리하세요.
              </p>
            </>
          )}
          <ParticipationForm
            key={kind + selected.join(",")}
            command="review_batch"
            label={
              kind === "reading"
                ? "읽은 기록 확인·보상 반영"
                : "선택한 최신 글 검토 완료"
            }
            onSuccess={() => {
              setNotice(
                selected.length +
                  "건의 " +
                  (kind === "reading"
                    ? "독서 기록 확인을 마쳤어요."
                    : decision === "completed"
                      ? "작품을 완료했어요."
                      : "글에 고쳐쓰기 피드백을 전했어요."),
              );
              setSelected([]);
            }}
            payload={() => ({
              items: selected.map((id) => ({ id, kind, read: true })),
              body,
              decision: kind === "reading" ? "completed" : decision,
            })}
          >
            {kind === "writing" && (
              <>
                <label className="field">
                  피드백
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required
                    maxLength={2000}
                    rows={4}
                  />
                </label>
                <label className="field">
                  검토 결과
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  >
                    <option value="completed">작품 완료</option>
                    <option value="revision_requested">
                      피드백을 읽고 고쳐 쓰기
                    </option>
                  </select>
                </label>
              </>
            )}
          </ParticipationForm>
        </section>
      )}
      <details className="panel">
        <summary>내 피드백 문구 저장</summary>
        <ParticipationForm
          command="preset_save"
          payload={(fd) => ({
            title: value(fd, "title"),
            body: value(fd, "body"),
          })}
          label="자주 쓰는 문구 저장"
        >
          <Field label="문구 이름" name="title" maxLength={80} />
          <TextArea label="피드백 내용" name="body" />
        </ParticipationForm>
        <p>
          내 계정에서만 보관합니다. 학생의 실제 글이나 이름을 문구에 넣지
          마세요.
        </p>
      </details>
    </div>
  );
}
