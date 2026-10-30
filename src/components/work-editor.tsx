"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Copy,
  MessageCircle,
  Save,
  Send,
} from "lucide-react";
import { saveDraft, submitWork } from "@/app/actions";
import { VersionComparison } from "@/components/writing-diff";
import { initialWritingState } from "@/lib/writing-state";
import type { Assignment, DashboardData, Submission } from "@/lib/data";
import {
  formatKoreanDate,
  validateWriting,
  WRITING_BODY_LIMIT,
  WRITING_TITLE_LIMIT,
} from "@/lib/rules";

type WorkEditorProps = { data: DashboardData; assignment: Assignment };
type Content = { title: string; body: string };
type SaveState = "empty" | "unsaved" | "saving" | "saved" | "error";

const sameContent = (left: Content, right: Content) =>
  left.title === right.title && left.body === right.body;

const statusLabels: Record<Submission["status"], string> = {
  submitted: "선생님이 읽어볼 차례예요",
  revision_requested: "피드백을 읽고 고쳐 보세요",
  completed: "미션을 완료했어요",
};

// Server Functions invoked by event handlers and timers run in an Action context.
function runAction<T>(action: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    startTransition(async () => {
      try {
        resolve(await action());
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function WorkEditor(props: WorkEditorProps) {
  // A different assignment must not reuse the previous assignment's draft refs.
  return (
    <AssignmentEditor
      key={`${props.assignment.id}:${props.data.profile.id}`}
      {...props}
    />
  );
}

function AssignmentEditor({ data, assignment }: WorkEditorProps) {
  const router = useRouter();
  const ownSubmissions = data.submissions
    .filter(
      (row) =>
        row.assignment_id === assignment.id &&
        row.student_id === data.profile.id,
    )
    .sort((left, right) => right.version - left.version);
  const initialDraft = data.drafts.find(
    (row) =>
      row.assignment_id === assignment.id && row.student_id === data.profile.id,
  );
  const initial = initialWritingState(initialDraft, ownSubmissions[0]);
  const initialContent: Content = initial.content;

  const [content, setContent] = useState<Content>(initialContent);
  const [saveState, setSaveState] = useState<SaveState>(
    initial.savedAt ? "saved" : "empty",
  );
  const [savedAt, setSavedAt] = useState<string | null>(
    initial.savedAt,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submissionNotice, setSubmissionNotice] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [navigationNotice, setNavigationNotice] = useState<string | null>(null);
  const [navigationPhase, setNavigationPhase] = useState<
    "idle" | "saving" | "routing"
  >("idle");
  const [navigationPending, startNavigation] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Submission | null>(null);

  const contentRef = useRef(content);
  const savedContentRef = useRef<Content>(initialContent);
  const hasSavedDraftRef = useRef(Boolean(initialDraft));
  const revisionRef = useRef(initialDraft?.revision ?? 0);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const savePausedRef = useRef(false);
  const submittingRef = useRef(false);
  const navigatingRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<{ payload: string; id: string } | null>(null);

  const canWrite =
    data.profile.role === "student" &&
    data.profile.consent_status === "verified";
  const canWriteRef = useRef(canWrite);
  canWriteRef.current = canWrite;

  // The acknowledged receipt is shown immediately. Once refreshed server data
  // contains it, the server's current review status takes precedence.
  const submissions =
    receipt && !ownSubmissions.some((row) => row.id === receipt.id)
      ? [receipt, ...ownSubmissions].sort(
          (left, right) => right.version - left.version,
        )
      : ownSubmissions;
  const latestSubmission = submissions[0];
  const awaitingReview = latestSubmission?.status === "submitted";
  const isNavigating = navigationPhase !== "idle";
  const unchangedFromSubmission = latestSubmission
    ? content.title.trim() === latestSubmission.title.trim() &&
      content.body.trim() === latestSubmission.body.trim()
    : false;
  const latestFeedback = latestSubmission
    ? data.feedback.filter((row) => row.submission_id === latestSubmission.id)
    : [];

  useEffect(() => {
    mountedRef.current = true;
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      // Read refs at exit time: a stale render must not report a save as complete.
      if (
        !sameContent(contentRef.current, savedContentRef.current) ||
        submittingRef.current
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnIfUnsaved);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("beforeunload", warnIfUnsaved);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flushDraft = useCallback(
    (retry = false): Promise<boolean> => {
      // Every caller shares a single drain. Submitting waits for this same drain,
      // including edits that arrived while an earlier save was in flight.
      if (savingRef.current) return savingRef.current;
      if (!canWriteRef.current) return Promise.resolve(false);
      if (retry) savePausedRef.current = false;
      if (savePausedRef.current) return Promise.resolve(false);

      const task: Promise<boolean> = (async () => {
        try {
          while (
            !hasSavedDraftRef.current ||
            !sameContent(contentRef.current, savedContentRef.current)
          ) {
            if (!mountedRef.current || !canWriteRef.current) return false;
            const snapshot = { ...contentRef.current };
            setSaveState("saving");
            setSaveError(null);

            const result = await runAction(() =>
              saveDraft({
                assignmentId: assignment.id,
                title: snapshot.title,
                body: snapshot.body,
                expectedRevision: revisionRef.current,
              }),
            );

            if (!result.ok || !result.data) {
              savePausedRef.current = true;
              if (mountedRef.current) {
                setSaveState("error");
                setSaveError(
                  result.message ||
                    "글을 저장하지 못했어요. 내용을 복사해 보관한 뒤 다시 시도해 주세요.",
                );
              }
              return false;
            }

            revisionRef.current = result.data.revision;
            savedContentRef.current = {
              title: result.data.title,
              body: result.data.body,
            };
            hasSavedDraftRef.current = true;
            // Never assign the response to the editor: newer typing may already exist.
            if (mountedRef.current) setSavedAt(result.data.updated_at);
            if (!sameContent(savedContentRef.current, snapshot)) {
              savePausedRef.current = true;
              if (mountedRef.current) {
                setSaveState("error");
                setSaveError(
                  "저장된 내용이 지금 보낸 글과 달라요. 현재 글을 복사해 보관한 뒤 새로고침해 주세요.",
                );
              }
              return false;
            }
          }
          if (mountedRef.current) setSaveState("saved");
          return true;
        } catch {
          savePausedRef.current = true;
          if (mountedRef.current) {
            setSaveState("error");
            setSaveError(
              "연결이 끊겨 저장 결과를 확인하지 못했어요. 글을 복사해 보관하고 다시 저장해 주세요.",
            );
          }
          return false;
        }
      })().finally(() => {
        if (savingRef.current === task) savingRef.current = null;
      });

      savingRef.current = task;
      return task;
    },
    [assignment.id],
  );

  useEffect(() => {
    const saveBeforeLinkNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(target instanceof HTMLAnchorElement) ||
        target.hasAttribute("download")
      )
        return;
      if (target.target && target.target.toLowerCase() !== "_self") return;

      let destination: URL;
      try {
        destination = new URL(target.href, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;
      // Moving to a heading in this document does not discard the editor.
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash
      ) {
        return;
      }
      const dirty = !sameContent(contentRef.current, savedContentRef.current);
      if (!dirty && !submittingRef.current && !navigatingRef.current) return;

      // Document capture runs before Next Link's click handler. Prevent both its
      // client navigation and the native default until the save is acknowledged.
      event.preventDefault();
      event.stopPropagation();
      if (submittingRef.current) {
        setNavigationNotice(
          "제출 결과를 확인하고 있어요. 잠시 뒤 다시 이동해 주세요.",
        );
        return;
      }
      if (navigatingRef.current) return;

      navigatingRef.current = true;
      setNavigationPhase("saving");
      setNavigationNotice("지금 쓴 글을 저장한 뒤 페이지를 이동할게요.");
      if (timerRef.current) clearTimeout(timerRef.current);

      void (async () => {
        try {
          const saved = await flushDraft(true);
          if (!mountedRef.current) return;
          if (
            !saved ||
            !sameContent(contentRef.current, savedContentRef.current)
          ) {
            navigatingRef.current = false;
            setNavigationPhase("idle");
            setNavigationNotice(
              "저장을 확인하지 못해 이 화면에 머물렀어요. 글을 복사해 보관하거나 다시 저장해 주세요.",
            );
            return;
          }
          setNavigationPhase("routing");
          startNavigation(() =>
            router.push(
              `${destination.pathname}${destination.search}${destination.hash}`,
            ),
          );
        } catch {
          if (mountedRef.current) {
            navigatingRef.current = false;
            setNavigationPhase("idle");
            setNavigationNotice(
              "이동을 마치지 못했어요. 글의 저장 상태를 확인하고 다시 이동해 주세요.",
            );
          }
        }
      })();
    };

    const saveOnHistoryTraversal = () => {
      // popstate cannot be cancelled. Start a best-effort save without changing
      // browser history; this is not a guarantee against back/forward data loss.
      if (
        !submittingRef.current &&
        !sameContent(contentRef.current, savedContentRef.current)
      ) {
        void flushDraft(true);
      }
    };

    document.addEventListener("click", saveBeforeLinkNavigation, true);
    window.addEventListener("popstate", saveOnHistoryTraversal);
    return () => {
      document.removeEventListener("click", saveBeforeLinkNavigation, true);
      window.removeEventListener("popstate", saveOnHistoryTraversal);
    };
  }, [flushDraft, router, startNavigation]);

  useEffect(() => {
    // Query-only navigation can keep this component mounted. Unlock it once
    // the router transition finishes, rather than leaving its inputs disabled.
    if (navigationPhase === "routing" && !navigationPending) {
      navigatingRef.current = false;
      setNavigationPhase("idle");
      setNavigationNotice(null);
    }
  }, [navigationPhase, navigationPending]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (
      !canWrite ||
      isSubmitting ||
      isNavigating ||
      savePausedRef.current ||
      sameContent(contentRef.current, savedContentRef.current)
    ) {
      return;
    }
    timerRef.current = setTimeout(() => {
      void flushDraft();
    }, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    content.title,
    content.body,
    canWrite,
    isSubmitting,
    isNavigating,
    flushDraft,
  ]);

  function updateContent(field: keyof Content, value: string) {
    if (!canWriteRef.current || submittingRef.current || navigatingRef.current)
      return;
    const next = { ...contentRef.current, [field]: value };
    contentRef.current = next;
    setContent(next);
    setFormError(null);
    setSubmissionNotice(null);
    setCopyNotice(null);
    setNavigationNotice(null);
    // Keep an error visible until an explicit successful retry, rather than
    // repeatedly issuing a conflicting write after every keystroke.
    if (!savePausedRef.current) {
      setSaveState(
        savingRef.current
          ? "saving"
          : sameContent(next, savedContentRef.current)
            ? hasSavedDraftRef.current
              ? "saved"
              : "empty"
            : "unsaved",
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submittingRef.current ||
      navigatingRef.current ||
      !canWriteRef.current ||
      awaitingReview
    )
      return;
    const validation = validateWriting(
      contentRef.current.title,
      contentRef.current.body,
    );
    if (!validation.success) {
      setFormError(
        validation.error.issues[0]?.message ?? "제목과 내용을 확인해 주세요.",
      );
      return;
    }
    if (unchangedFromSubmission) {
      setFormError(
        "앞서 제출한 글과 같아요. 피드백을 읽고 생각이나 표현을 고쳐 보세요.",
      );
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setFormError(null);
    setSubmissionNotice(null);
    if (timerRef.current) clearTimeout(timerRef.current);

    try {
      const saved = await flushDraft(true);
      if (!saved) {
        setFormError(
          "초안의 저장 상태를 먼저 확인해 주세요. 현재 글은 이 화면에 그대로 있어요.",
        );
        return;
      }
      // Inputs are locked during this operation. Validate the final ref after
      // draining saves so this payload is exactly the latest submitted content.
      const final = validateWriting(
        contentRef.current.title,
        contentRef.current.body,
      );
      if (!final.success) {
        setFormError(
          final.error.issues[0]?.message ?? "제목과 내용을 확인해 주세요.",
        );
        return;
      }
      const payload = JSON.stringify([
        assignment.id,
        final.data.title,
        final.data.body,
      ]);
      if (requestRef.current?.payload !== payload) {
        requestRef.current = { payload, id: crypto.randomUUID() };
      }
      const result = await runAction(() =>
        submitWork({
          assignmentId: assignment.id,
          title: final.data.title,
          body: final.data.body,
          requestId: requestRef.current!.id,
        }),
      );
      if (!mountedRef.current) return;
      if (!result.ok || !result.data) {
        setFormError(
          result.message ||
            "제출 결과를 확인하지 못했어요. 같은 내용으로 다시 시도해 주세요.",
        );
        return;
      }
      setReceipt(result.data);
      setSubmissionNotice(
        `${result.data.version}번째 글을 선생님께 제출했어요. 제출한 내용은 아래 기록에서 확인할 수 있어요.`,
      );
      startTransition(() => router.refresh());
    } catch {
      if (mountedRef.current) {
        setFormError(
          "제출 결과를 확인하지 못했어요. 글을 보관하고 같은 내용으로 다시 제출해 주세요.",
        );
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setIsSubmitting(false);
    }
  }

  async function copyWriting() {
    try {
      await navigator.clipboard.writeText(
        `${contentRef.current.title}\n\n${contentRef.current.body}`,
      );
      if (mountedRef.current) setCopyNotice("지금 쓴 글을 복사했어요.");
    } catch {
      if (mountedRef.current)
        setCopyNotice(
          "복사하지 못했어요. 제목과 내용을 직접 선택해서 복사해 주세요.",
        );
    }
  }

  const saveMessage =
    saveState === "saving"
      ? "저장하고 있어요…"
      : saveState === "unsaved"
        ? "아직 저장하지 않은 내용이 있어요. 잠시 멈추면 저장돼요."
        : saveState === "error"
          ? "저장을 확인하지 못했어요"
          : saveState === "saved"
            ? savedAt
              ? `${formatKoreanDate(savedAt)} 저장했어요`
              : "작성한 내용이 저장돼 있어요"
            : "글을 쓰면 잠시 뒤 초안이 저장돼요";

  return (
    <div className="editor-layout">
      <section className="panel editor-panel" aria-labelledby="writing-heading">
        <div className="card-topline">
          <h2 id="writing-heading">나의 글</h2>
          {latestSubmission && (
            <span className={`status-pill ${latestSubmission.status}`}>
              {statusLabels[latestSubmission.status]}
            </span>
          )}
        </div>
        <details className="studio-history">
          <summary>초고와 고친 글 나란히 비교하기</summary>
          <VersionComparison versions={submissions} />
        </details>
        {!canWrite && (
          <div className="notice">
            <strong>
              {data.profile.role === "student"
                ? "보호자 동의 확인을 기다리고 있어요"
                : "학생 계정에서 글을 쓸 수 있어요"}
            </strong>
            선생님에게 계정의 참여 준비 상태를 확인해 주세요.
          </div>
        )}
        {assignment.mission_snapshot.requires_revision && (
          <p className="notice">
            이 미션은 초고 제출 → 선생님 피드백 → 글 고치기 순서로 함께해요.
          </p>
        )}

        <form onSubmit={handleSubmit} aria-busy={isSubmitting || isNavigating}>
          <div className="field">
            <label htmlFor="writing-title">글 제목</label>
            <input
              id="writing-title"
              name="title"
              value={content.title}
              onChange={(event) => updateContent("title", event.target.value)}
              maxLength={WRITING_TITLE_LIMIT}
              disabled={!canWrite || isSubmitting || isNavigating}
              aria-describedby="title-count"
              placeholder="내 생각에 어울리는 제목을 붙여 주세요"
              autoComplete="off"
            />
            <span className="field-hint" id="title-count">
              {content.title.length} / {WRITING_TITLE_LIMIT}자
            </span>
          </div>
          <div className="field">
            <label htmlFor="writing-body">생각을 펼쳐 보세요</label>
            <textarea
              id="writing-body"
              name="body"
              value={content.body}
              onChange={(event) => updateContent("body", event.target.value)}
              maxLength={WRITING_BODY_LIMIT}
              rows={14}
              disabled={!canWrite || isSubmitting || isNavigating}
              aria-describedby="writing-help writing-count"
              placeholder="읽은 책의 제목과 작가를 적고, 미션 질문에 대한 내 생각을 써 보세요."
            />
            <span className="field-hint" id="writing-help">
              내가 읽은 책과 떠올린 생각을 내 말로 적어요. 초안은 고쳐 쓸 수
              있고, 제출한 글은 기록으로 남아요.
            </span>
          </div>
          <div className="editor-count">
            <span
              className={`save-indicator${saveState === "error" ? " error" : ""}`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {saveState === "saved" ? (
                <CheckCircle2 size={14} aria-hidden="true" />
              ) : (
                <Save size={14} aria-hidden="true" />
              )}
              {saveMessage}
            </span>
            <span id="writing-count">
              {content.body.length.toLocaleString("ko-KR")} / 10,000자
            </span>
          </div>

          {saveError && (
            <p className="form-status error" role="alert">
              {saveError} 글을 잃지 않도록 아래 ‘글 복사하기’를 이용할 수
              있어요.
            </p>
          )}
          {formError && (
            <p className="form-status error" role="alert">
              {formError}
            </p>
          )}
          {submissionNotice && (
            <p className="form-status" role="status">
              {submissionNotice}
            </p>
          )}
          {navigationNotice && (
            <p className="form-status" role="status" aria-live="polite">
              {navigationNotice}
            </p>
          )}

          {awaitingReview && (
            <p className="form-help">
              선생님이 제출한 글을 읽고 있어요. 초안은 계속 고칠 수 있고,
              피드백을 받은 뒤 다시 제출할 수 있어요.
            </p>
          )}
          {latestSubmission?.status === "completed" && (
            <p className="form-help">
              완료한 글도 더 다듬어 새 버전으로 제출할 수 있어요. 앞선 완료
              기록은 남아 있어요.
            </p>
          )}
          <div className="button-row">
            <button
              type="submit"
              className="button button-primary"
              disabled={
                !canWrite ||
                isSubmitting ||
                isNavigating ||
                awaitingReview ||
                unchangedFromSubmission
              }
            >
              <Send size={15} aria-hidden="true" />
              {isSubmitting
                ? "저장하고 제출하는 중…"
                : latestSubmission
                  ? "고친 글 제출하기"
                  : "선생님께 제출하기"}
            </button>
            <button
              type="button"
              className="button button-outline"
              disabled={
                !canWrite ||
                isSubmitting ||
                isNavigating ||
                saveState === "saving"
              }
              onClick={() => {
                void flushDraft(true);
              }}
            >
              <Save size={15} aria-hidden="true" />
              {saveState === "error" ? "다시 저장하기" : "지금 저장하기"}
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                void copyWriting();
              }}
            >
              <Copy size={15} aria-hidden="true" />글 복사하기
            </button>
          </div>
          {copyNotice && (
            <p className="form-help" role="status">
              {copyNotice}
            </p>
          )}
        </form>
      </section>

      <aside aria-label="활동 안내와 제출 기록">
        <section className="panel" aria-labelledby="activity-heading">
          <BookOpen className="accent-icon" size={23} aria-hidden="true" />
          <h2 id="activity-heading">오늘의 생각 질문</h2>
          <p className="submission-body">
            {assignment.mission_snapshot.prompt}
          </p>
          {assignment.due_at && (
            <p className="form-help">
              학습 마감: {formatKoreanDate(assignment.due_at)} · 늦어도 학습
              글은 제출할 수 있어요.
            </p>
          )}
          {!!assignment.mission_snapshot.steps?.length && (
            <details>
              <summary className="text-link">활동 순서 펼쳐 보기</summary>
              <ol className="guide-list">
                {assignment.mission_snapshot.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </details>
          )}
        </section>

        <section
          className="panel section-status"
          aria-labelledby="feedback-heading"
        >
          <MessageCircle className="accent-icon" size={23} aria-hidden="true" />
          <h2 id="feedback-heading">선생님의 피드백</h2>
          {latestFeedback.length ? (
            latestFeedback.map((feedback) => (
              <div className="feedback-item" key={feedback.id}>
                <small>
                  {latestSubmission.version}번째 글에 대한 이야기 ·{" "}
                  {formatKoreanDate(feedback.created_at)}
                </small>
                <p>{feedback.body}</p>
              </div>
            ))
          ) : (
            <p className="form-help">
              {latestSubmission
                ? "선생님의 피드백이 도착하면 여기에 보여요."
                : "초고를 제출하면 선생님이 함께 읽고 이야기를 남겨 주세요."}
            </p>
          )}
        </section>

        <section
          className="panel section-status"
          aria-labelledby="history-heading"
        >
          <h2 id="history-heading">내 생각이 자라는 기록</h2>
          <p className="form-help">
            제출한 내용은 그대로 남아요. 고친 글은 새로운 버전으로 쌓여요.
          </p>
          {submissions.length ? (
            submissions.map((submission) => (
              <details className="feedback-item" key={submission.id}>
                <summary>
                  <strong>
                    {submission.version}번째 글 · {submission.title}
                  </strong>
                  <br />
                  <small>
                    {formatKoreanDate(submission.created_at)} ·{" "}
                    {statusLabels[submission.status]}
                  </small>
                </summary>
                <p className="submission-body">{submission.body}</p>
                {data.feedback
                  .filter(
                    (feedback) => feedback.submission_id === submission.id,
                  )
                  .map((feedback) => (
                    <div className="feedback-item" key={feedback.id}>
                      <small>
                        이 버전의 피드백 ·{" "}
                        {formatKoreanDate(feedback.created_at)}
                      </small>
                      <p>{feedback.body}</p>
                    </div>
                  ))}
              </details>
            ))
          ) : (
            <p className="empty-state">첫 글을 제출하면 기록이 시작돼요.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
