"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Classroom } from "@/lib/data";
import type { ReviewState } from "@/lib/learning-queues";
import { feedbackStarters } from "@/lib/participation";
import { Field } from "@/components/hub/shared";
import { useTeacherWorkDraft, TeacherWorkDraftNotice } from "@/components/teacher-work-draft";
import { ParticipationForm, TextArea, value } from "./form";
import { ReviewHistory } from "./review-history";

type ReviewMode = "one" | "batch";

export function ReviewQueue({
  state,
  classes,
  showClassFilter = true,
  basePath = "/hub?tab=review",
  owner,
}: {
  state: ReviewState;
  classes: Classroom[];
  showClassFilter?: boolean;
  basePath?: string;
  owner: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { kind, rows, page } = state;
  const classId = state.classroom ?? "";
  const href = (reviewKind = kind, classroom = classId, reviewPage = page) =>
    basePath + "&" + new URLSearchParams({ reviewKind, classroom, reviewPage: String(reviewPage) });

  const [mode, setMode] = useState<ReviewMode>("one");
  const [currentId, setCurrentId] = useState<string | undefined>(() => params.get("reviewRecord") ?? undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [handled, setHandled] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [decision, setDecision] = useState("completed");
  const [notice, setNotice] = useState("");
  const [nextRecord, setNextRecord] = useState<string>();
  const [sending, setSending] = useState(false);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const queue = rows.filter(row => !handled.includes(row.id));
  const current = mode === "one" ? queue.find(row => row.id === currentId) : undefined;

  const draft = useTeacherWorkDraft({
    owner,
    scope: "review",
    context: current
      ? { classroom: current.classroom_id, kind, record: current.id }
      : { classroom: classId || null, kind, page },
    payload: { selected, body, decision },
    enabled: selected.length > 0,
    apply: payload => {
      const ids = Array.isArray(payload.selected) ? payload.selected.filter((id): id is string => typeof id === "string") : [];
      if ((current && ids.length > 0 && (ids.length !== 1 || ids[0] !== current.id)) ||
          ids.some(id => !queue.some(row => row.id === id)))
        throw Error("원래 검토 대상이 이 페이지에서 바뀌었어요. 교사 초안을 파일로 보관하고 학생 기록을 다시 확인해 주세요.");
      if (!current && ids.length) {
        setMode("batch");
        selectRecord(undefined);
      }
      setSelected(ids);
      setOpened(new Set());
      setBody(typeof payload.body === "string" ? payload.body : "");
      setDecision(payload.decision === "revision_requested" ? "revision_requested" : "completed");
    },
  });

  useEffect(() => {
    if (currentId) detailRef.current?.focus();
  }, [currentId]);

  useEffect(() => {
    if (notice) resultRef.current?.focus();
  }, [notice, nextRecord]);

  function resetInput() {
    setSelected([]);
    setOpened(new Set());
    setBody("");
    setDecision("completed");
  }

  function selectRecord(id: string | undefined) {
    setCurrentId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("reviewRecord", id);
    else url.searchParams.delete("reviewRecord");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function showRecord(id: string) {
    if (id === currentId || sending || !draft.confirmLeave()) return;
    resetInput();
    setNotice("");
    selectRecord(id);
  }

  function openList() {
    if (sending || !draft.confirmLeave()) return;
    resetInput();
    selectRecord(undefined);
    requestAnimationFrame(() => {
      if (currentId) document.getElementById("review-select-" + currentId)?.focus();
    });
  }

  function markRead(id: string, checked: boolean) {
    if (mode === "one" && checked) setOpened(new Set([id]));
    setSelected(old => checked ? [...new Set([...old, id])] : old.filter(value => value !== id));
  }

  const result = notice && (
    <div className="notice review-result" ref={resultRef} tabIndex={-1}>
      <p role="status">{notice}</p>
      {nextRecord && queue.some(row => row.id === nextRecord) && (
        <button type="button" className="button button-outline" onClick={() => {
          if (mode === "one") showRecord(nextRecord);
          else {
            const details = document.getElementById("review-" + nextRecord);
            if (details instanceof HTMLDetailsElement) {
              details.open = true;
              details.querySelector("summary")?.focus();
            }
          }
        }}>다음 기록 보기</button>
      )}
    </div>
  );

  const paging = (
    <div className="button-row" aria-label="검토 목록 페이지">
      <button type="button" className="button button-outline" disabled={sending || page <= 1}
        onClick={() => { if (draft.confirmLeave()) router.push(href(kind, classId, page - 1)); }}>
        이전 묶음
      </button>
      <span>{page}묶음 · 전체 {state.total}건</span>
      <button type="button" className="button button-outline" disabled={sending || page * 20 >= state.total}
        onClick={() => { if (draft.confirmLeave()) router.push(href(kind, classId, page + 1)); }}>
        다음 묶음
      </button>
    </div>
  );

  const isBatch = mode === "batch";
  const controls = selected.length > 0 && (
    <section className="review-controls" aria-label={isBatch ? "일괄 검토 입력" : "이 기록 검토 입력"}>
      <h3>{isBatch ? `선택한 ${selected.length}건 처리` : "검토 결과 남기기"}</h3>
      <ParticipationForm
        key={kind + selected.join(",")}
        command="review_batch"
        label={kind === "reading" ? "읽은 기록 확인·보상 반영"
          : isBatch ? "선택한 최신 글 검토 완료"
          : decision === "revision_requested" ? "고쳐쓰기 피드백 보내기" : "이 글 확인 완료"}
        disabled={draft.blocked || selected.some(id => !opened.has(id) || !queue.some(row => row.id === id))}
        onBusyChange={setSending}
        onSuccess={async () => {
          await draft.clear();
          const action = kind === "reading" ? "독서 기록 확인을 마쳤어요."
            : decision === "completed" ? "작품을 완료했어요." : "글에 고쳐쓰기 피드백을 전했어요.";
          setNotice(selected.length + "건의 " + action);
          const last = queue.findLastIndex(row => selected.includes(row.id));
          const remaining = queue.slice(last + 1).find(row => !selected.includes(row.id))
            ?? queue.find(row => !selected.includes(row.id));
          setNextRecord(remaining?.id);
          setHandled(previous => [...previous, ...selected]);
          selectRecord(undefined);
          resetInput();
        }}
        payload={() => ({
          items: selected.map(id => ({ id, kind, read: opened.has(id) })),
          body,
          decision: kind === "reading" ? "completed" : decision,
        })}
      >
        {kind === "writing" && (
          <>
            <label className="field">
              피드백 문구 불러오기
              <select defaultValue="" onChange={event => { if (event.target.value) setBody(event.target.value); }}>
                <option value="">문구를 고른 뒤 학생에 맞게 수정하세요</option>
                {[...feedbackStarters, ...state.presets.map(p => p.body)].map((item, index) => (
                  <option key={index} value={item}>{item.slice(0, 55)}</option>
                ))}
              </select>
            </label>
            {isBatch && <p className="form-help">선택한 학생 모두에게 같은 피드백을 보냅니다.</p>}
            <label className="field">
              피드백
              <textarea value={body} onChange={event => setBody(event.target.value)} required maxLength={2000} rows={4} />
            </label>
            <label className="field">
              검토 결과
              <select value={decision} onChange={event => setDecision(event.target.value)}>
                <option value="completed">작품 완료</option>
                <option value="revision_requested">피드백을 읽고 고쳐 쓰기</option>
              </select>
            </label>
          </>
        )}
      </ParticipationForm>
    </section>
  );

  function recordTitle(row: ReviewState["rows"][number]) {
    return row.student_name + " · " + row.title + (row.version ? ` · ${row.version}번째 글` : " · 독서 기록");
  }

  return (
    <div className="review-queue" data-hub-dirty={draft.unsaved || sending}>
      <h2>학생 기록 확인</h2>
      {result}
      <TeacherWorkDraftNotice draft={draft} />
      <div className="today-actions">
        <div><strong>{state.totals.writing}</strong><span>새 글·재제출 확인 대기</span></div>
        <div><strong>{state.totals.reading}</strong><span>완독 확인 대기</span></div>
        <div><strong>{state.totals.revision}</strong><span>학생의 고쳐쓰기 기다림</span></div>
      </div>
      <div className="hub-inline">
        <label className="field">
          기록 종류
          <select value={kind} disabled={sending} onChange={event => {
            if (draft.confirmLeave()) router.push(href(event.target.value as ReviewState["kind"], classId, 1));
          }}>
            <option value="writing">글쓰기 · 최신 제출만</option>
            <option value="reading">완독 기록 · 아직 확인하지 않은 것</option>
          </select>
        </label>
        {showClassFilter && (
          <label className="field">
            학급 필터
            <select value={classId} disabled={sending} onChange={event => {
              if (draft.confirmLeave()) router.push(href(kind, event.target.value, 1));
            }}>
              <option value="">진행 중인 담당 학급 전체</option>
              {classes.filter(c => c.term_state !== "archived").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="button-row review-mode" role="group" aria-label="검토 방법">
        {([["one", "한 건씩 보기"], ["batch", "여러 건 선택"]] as const).map(([key, label]) => (
          <button type="button" className="button button-outline" key={key} aria-pressed={mode === key} disabled={sending}
            onClick={() => {
              if (mode === key || !draft.confirmLeave()) return;
              resetInput();
              selectRecord(undefined);
              setNotice("");
              setMode(key);
            }}>{label}</button>
        ))}
      </div>
      {!queue.length && <p className="hub-empty">현재 묶음에 확인할 기록이 없어요.</p>}
      {isBatch ? (
        <>
          {queue.length > 0 && <p className="form-help">기록을 펼쳐 읽고 표시하면 한 번에 20건까지 처리할 수 있어요.</p>}
          {queue.map(row => (
            <article key={row.id} className="review-card">
              <details id={"review-" + row.id} onToggle={event => {
                if (event.currentTarget.open) setOpened(old => new Set([...old, row.id]));
              }}>
                <summary>{recordTitle(row)}</summary>
                <p className="submission-body">{row.body}</p>
                {row.kind === "writing" && <ReviewHistory submission={row.id} />}
              </details>
              <label className="hub-check">
                <input type="checkbox" checked={selected.includes(row.id)}
                  disabled={sending || !opened.has(row.id) || (!selected.includes(row.id) && selected.length >= 20)}
                  onChange={event => markRead(row.id, event.target.checked)} />
                이 기록을 읽고 확인했어요
              </label>
            </article>
          ))}
          {paging}
          {controls}
        </>
      ) : (
        <div className={current ? "review-single has-record" : "review-single"}>
          <section className="review-list" aria-label="검토할 기록">
            {queue.map(row => (
              <button type="button" className="review-list-record" key={row.id} id={"review-select-" + row.id}
                aria-pressed={current?.id === row.id} disabled={sending} onClick={() => showRecord(row.id)}>
                <strong>{row.title}</strong>
                <span>{row.student_name} · {classes.find(c => c.id === row.classroom_id)?.name}
                  {row.version ? ` · ${row.version}번째 글` : " · 독서 기록"}</span>
              </button>
            ))}
            {paging}
          </section>
          {current && (
            <section key={current.id} className="panel review-card review-detail" aria-labelledby="review-detail-heading">
              <button type="button" className="button button-outline" disabled={sending} onClick={openList}>목록으로 돌아가기</button>
              <h3 id="review-detail-heading" ref={detailRef} tabIndex={-1}>{recordTitle(current)}</h3>
              <p className="submission-body">{current.body}</p>
              {kind === "writing" && <ReviewHistory submission={current.id} />}
              <label className="hub-check">
                <input type="checkbox" checked={selected.includes(current.id) && opened.has(current.id)}
                  disabled={sending || draft.blocked} onChange={event => markRead(current.id, event.target.checked)} />
                이 기록을 읽고 확인했어요
              </label>
              {controls}
            </section>
          )}
        </div>
      )}
      <details className="panel">
        <summary>내 피드백 문구 저장</summary>
        <ParticipationForm command="preset_save" payload={fd => ({ title: value(fd, "title"), body: value(fd, "body") })}
          label="자주 쓰는 문구 저장">
          <Field label="문구 이름" name="title" maxLength={80} />
          <TextArea label="피드백 내용" name="body" />
        </ParticipationForm>
        <p>내 계정에서만 보관하는 문구예요.</p>
      </details>
    </div>
  );
}
