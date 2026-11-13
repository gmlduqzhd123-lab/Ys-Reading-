"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatKoreanDate } from "@/lib/rules";
import {
  useTeacherWorkDraft,
  TeacherWorkDraftNotice,
} from "@/components/teacher-work-draft";
import {
  createReport,
  reviewReport,
  previewReportBatch,
  saveReportBatch,
} from "@/app/reports/actions";
import {
  reportCounts,
  type GrowthReport,
  type ReportState,
} from "@/lib/growth-report";
export function ReportComposer({
  state,
  owner,
}: {
  state: ReportState;
  owner: string;
}) {
  const router = useRouter(),
    [title, setTitle] = useState(state.student.name + "의 책숲 성장 기록"),
    [note, setNote] = useState(""),
    [works, setWorks] = useState<string[]>([]),
    [sources, setSources] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef(crypto.randomUUID());
  const draft = useTeacherWorkDraft({
    owner,
    scope: "report",
    context: {
      classroom: state.classroom.id,
      student: state.student.id,
      from: state.from,
      until: state.until,
    },
    payload: { title, note, works, sources },
    apply: (p) => {
      setTitle(
        typeof p.title === "string"
          ? p.title
          : state.student.name + "의 책숲 성장 기록",
      );
      setNote(typeof p.note === "string" ? p.note : "");
      setWorks(
        Array.isArray(p.works)
          ? p.works.filter(
              (id): id is string =>
                typeof id === "string" && state.works.some((w) => w.id === id),
            )
          : [],
      );
      setSources(
        Array.isArray(p.sources)
          ? p.sources.filter(
              (id): id is string =>
                typeof id === "string" &&
                /^(answer|paper):[0-9a-f-]{36}$/.test(id),
            )
          : [],
      );
      setConfirmed(false);
      request.current = crypto.randomUUID();
    },
  });
  function changed() {
    request.current = crypto.randomUUID();
    setConfirmed(false);
  }
  return (
    <section className="panel">
      <h2>{state.student.name}의 보고서 준비</h2>
      <Link
        className="button button-outline"
        href={
          "/classroom?classroom=" +
          state.classroom.id +
          "&section=evidence&student=" +
          state.student.id +
          "#evidence"
        }
      >
        독서·글쓰기·수업 활동의 원기록 확인
      </Link>
      <TeacherWorkDraftNotice draft={draft} />
      <p>
        {state.classroom.name} ·{" "}
        {state.from ? `${state.from} ~ ${state.until}` : "이 학급의 전체 기간"}{" "}
        · 다음 저장은 {state.latestVersion + 1}판입니다.
      </p>
      <dl className="hub-row">
        {Object.entries(reportCounts).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{state.counts[key as keyof typeof state.counts]}</dd>
          </div>
        ))}
      </dl>
      <p>
        완독은 학생이 표시한 기록을 ISBN 또는 제목·저자로 모은 수입니다. 다시
        제출한 횟수는 실력 향상을 자동 평가하지 않습니다. 출석 활동일은 학교
        출결과 다릅니다.
      </p>
      <fieldset disabled={busy || draft.blocked}>
        <legend>대표 작품 선택 · 최대 3편</legend>
        {!state.works.length && (
          <p>
            선택한 기간에 완료한 글이 없어요. 활동 수치와 선생님 의견만으로도
            저장할 수 있습니다.
          </p>
        )}
        {state.works.map((w) => (
          <div key={w.id} className="hub-record">
            <label className="hub-check">
              <input
                type="checkbox"
                checked={works.includes(w.id)}
                disabled={!works.includes(w.id) && works.length >= 3}
                onChange={(e) => {
                  setWorks((old) =>
                    e.target.checked
                      ? [...old, w.id]
                      : old.filter((id) => id !== w.id),
                  );
                  changed();
                }}
              />
              {w.title} · {w.version}번째 글
            </label>
            <details>
              <summary>대표 작품 원문 확인</summary>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {w.body}
              </p>
            </details>
          </div>
        ))}
        <p>
          완료 작품 {state.candidateTotal}편 중 현재 {state.works.length}
          편입니다. 다른 페이지로 이동하면 아직 저장하지 않은 선택과 의견은
          달라질 수 있어요. 교사 초안 불러오기로 보관한 입력을 복원할 수
          있습니다.
        </p>
        <fieldset>
          <legend>수업 활동 근거 선택 · 최대 3개</legend>
          <p>
            완료한 활동지·퀴즈 제출본과 종이 활동의 교사 관찰 중 직접 확인한
            근거를 선택합니다. 선택한 원문만 이 보고서 판에 보존되어 학생·보호자
            공유와 파일·Google 내보내기에 포함됩니다.
          </p>
          {(state.evidenceCandidates ?? []).map((v) => (
            <div className="hub-record" key={v.key}>
              <label className="hub-check">
                <input
                  type="checkbox"
                  checked={sources.includes(v.key)}
                  disabled={!sources.includes(v.key) && sources.length >= 3}
                  onChange={(e) => {
                    setSources((old) =>
                      e.target.checked
                        ? [...old, v.key]
                        : old.filter((x) => x !== v.key),
                    );
                    changed();
                  }}
                />
                {v.title} ·{" "}
                {v.kind === "paper"
                  ? "종이 활동 관찰"
                  : v.version + "번째 활동"}
              </label>
              <details>
                <summary>수업 근거 원문 확인</summary>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {v.body}
                </p>
              </details>
            </div>
          ))}
          <p>
            수업 근거 {state.evidenceTotal ?? 0}개 · 현재 선택 {sources.length}
            개
          </p>
          {sources.length > 0 && (
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                setSources([]);
                changed();
              }}
            >
              수업 근거 선택 비우기
            </button>
          )}
          <nav className="button-row" aria-label="보고서 수업 근거 목록">
            {(state.evidencePage ?? 1) > 1 && (
              <Link
                href={
                  "/reports?" +
                  new URLSearchParams({
                    classroom: state.classroom.id,
                    student: state.student.id,
                    ...(state.from
                      ? { from: state.from, until: state.until! }
                      : {}),
                    evidencePage: String((state.evidencePage ?? 1) - 1),
                  })
                }
              >
                보고서 수업 근거 이전
              </Link>
            )}
            {(state.evidencePage ?? 1) * 30 < (state.evidenceTotal ?? 0) && (
              <Link
                href={
                  "/reports?" +
                  new URLSearchParams({
                    classroom: state.classroom.id,
                    student: state.student.id,
                    ...(state.from
                      ? { from: state.from, until: state.until! }
                      : {}),
                    evidencePage: String((state.evidencePage ?? 1) + 1),
                  })
                }
              >
                보고서 수업 근거 다음
              </Link>
            )}
          </nav>
        </fieldset>
        <label className="field">
          성장 보고서 제목
          <input
            value={title}
            maxLength={100}
            required
            onChange={(e) => {
              setTitle(e.target.value);
              changed();
            }}
          />
        </label>
        <label className="field">
          선생님의 관찰과 응원
          <textarea
            value={note}
            maxLength={2000}
            rows={5}
            onChange={(e) => {
              setNote(e.target.value);
              changed();
            }}
          />
        </label>
        <p>
          초안은 선생님만 봅니다. 저장 후 내용 검토와 학생 공개를 따로
          진행합니다.
        </p>
        <label className="hub-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          활동 수치·선택한 원문·관찰 의견과 공개 범위를 직접 확인했습니다
        </label>
        <button
          className="button button-primary"
          disabled={!confirmed || !title.trim()}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              const r = await createReport({
                classroom: state.classroom.id,
                student: state.student.id,
                from: state.from,
                until: state.until,
                works,
                sources,
                title,
                note,
                publish: false,
                sourceToken: state.sourceToken,
                confirmed,
                version: state.latestVersion,
                requestId: request.current,
              });
              setMessage(r.message);
              if (r.ok) {
                await draft.clear().catch(() => {});
                request.current = crypto.randomUUID();
                setConfirmed(false);
                router.refresh();
              }
            } catch {
              setMessage(
                "연결이 끊겼어요. 입력을 유지한 채 같은 내용으로 다시 저장해 주세요.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "저장 중…" : "확인한 보고서 새 판 저장"}
        </button>
      </fieldset>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
export function ReportBatch({
  classroom,
  from,
  until,
}: {
  classroom: string;
  from: string | null;
  until: string | null;
}) {
  type Item = Awaited<ReturnType<typeof previewReportBatch>>["data"][number];
  const router = useRouter(),
    [items, setItems] = useState<Item[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [next, setNext] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, boolean>>({});
  const request = useRef(crypto.randomUUID());
  async function preview(after?: string) {
    setBusy(true);
    setConfirmed(false);
    setOutcomes({});
    try {
      const r = await previewReportBatch({ classroom, from, until, after });
      setItems(r.data);
      setSelected(r.data.map((x) => x.student));
      setNext(r.next ?? null);
      setMessage(r.message);
      request.current = crypto.randomUUID();
    } catch {
      setMessage("명단을 불러오지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>학급 보고서 초안 함께 만들기</h2>
      <p role="status" aria-live="polite">
        {busy
          ? "선택한 학급의 명단과 보고서를 처리하고 있어요. 완료될 때까지 이 화면을 유지해 주세요."
          : ""}
      </p>
      <p>
        한 번에 30명까지 활동 수치를 확인합니다. 학생에게 자동으로 공개하지
        않습니다.
      </p>
      <button
        className="button button-outline"
        disabled={busy}
        onClick={() => void preview()}
      >
        일괄 생성 명단·수치 미리 보기
      </button>
      <fieldset disabled={busy}>
        {items.map((item) => (
          <label className="hub-check" key={item.student}>
            <input
              type="checkbox"
              checked={selected.includes(item.student)}
              onChange={(e) => {
                setSelected((old) =>
                  e.target.checked
                    ? [...old, item.student]
                    : old.filter((x) => x !== item.student),
                );
                setConfirmed(false);
                request.current = crypto.randomUUID();
              }}
            />
            {item.name} · 독서 {item.counts.readingLogs}건 · 완료 글{" "}
            {item.counts.completedMissions}편 · 다음 {item.version + 1}판
            {item.student in outcomes &&
              (outcomes[item.student]
                ? " · 초안 생성 완료"
                : " · 다시 불러와 확인 필요")}
          </label>
        ))}
        {!!items.length && (
          <>
            <label className="hub-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              선택한 학생과 기간·수치를 확인했으며 개별 검토 전에는 공개하지
              않습니다
            </label>
            <button
              className="button button-primary"
              disabled={!confirmed || !selected.length}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await saveReportBatch({
                    classroom,
                    from,
                    until,
                    items: items
                      .filter((x) => selected.includes(x.student))
                      .map(({ name: _, counts: __, ...x }) => x),
                    requestId: request.current,
                    confirmed: true,
                  });
                  setMessage(
                    r.message +
                      " 성공 " +
                      r.data.filter((x) => x.ok).length +
                      "명 · 재확인 " +
                      r.data.filter((x) => !x.ok).length +
                      "명",
                  );
                  setOutcomes(
                    Object.fromEntries(r.data.map((x) => [x.student, x.ok])),
                  );
                  if (r.ok) {
                    setConfirmed(false);
                    router.refresh();
                  }
                } catch {
                  setMessage(
                    "연결을 확인하고 같은 요청으로 다시 시도해 주세요.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              선택한 학생 초안 만들기
            </button>
          </>
        )}
      </fieldset>
      {next && (
        <button
          className="button button-outline"
          disabled={busy}
          onClick={() => void preview(next)}
        >
          다음 30명 미리 보기
        </button>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
export function ReportArchive({
  reports,
  teacher,
}: {
  reports: GrowthReport[];
  teacher: boolean;
}) {
  const router = useRouter(),
    [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [url, setUrl] = useState("");
  const keys = useRef<Record<string, string>>({});
  async function download(report: GrowthReport, format: string) {
    if (busy) return;
    const popup =
      format === "print" ? window.open("about:blank", "_blank") : null;
    setBusy(report.id);
    setMessage("");
    setUrl("");
    const key = report.id + ":" + format;
    keys.current[key] ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: report.id,
          format,
          requestId: keys.current[key],
        }),
      });
      if (!r.ok) {
        const e = await r.json();
        throw Error(e.error || "내보내지 못했어요.");
      }
      if (format.startsWith("google-")) {
        const d = await r.json();
        setUrl(d.url);
        setMessage("Google 파일을 만들었어요. 파일의 공유 범위를 확인하세요.");
      } else {
        if (format === "print" && popup) {
          popup.location.href =
            "/api/reports/print?id=" + encodeURIComponent(report.id);
          setMessage("새 창의 인쇄 버튼에서 PDF 저장을 선택하세요.");
          return;
        }
        const blob = await r.blob(),
          href = URL.createObjectURL(blob);
        if (popup) {
          popup.location.href = href;
          setMessage("새 창의 인쇄 버튼에서 PDF 저장을 선택하세요.");
        } else {
          const a = document.createElement("a");
          a.href = href;
          a.download =
            "bookforest-growth." +
            (format === "docx" ? "docx" : format === "csv" ? "csv" : "html");
          a.click();
          setMessage(
            format === "print"
              ? "새 창이 차단되어 인쇄용 HTML을 준비했어요. 파일을 열어 인쇄·PDF 저장을 이용하세요."
              : "보고서 파일을 준비했어요. 다운로드 또는 저장 위치를 확인하세요.",
          );
        }
        setTimeout(() => URL.revokeObjectURL(href), 60000);
      }
    } catch (e) {
      popup?.close();
      setMessage(e instanceof Error ? e.message : "다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel">
      <h2>저장한 성장 보고서</h2>
      <p>
        저장한 판의 원문과 수치는 이후 수정되지 않습니다. 교사의 확인을 거쳐 새
        판을 만들 수 있습니다.
      </p>
      {!reports.length && <p>아직 저장한 보고서가 없어요.</p>}
      {reports.map((r) => (
        <article className="hub-record" key={r.id}>
          <h3>
            {r.title} · {r.version}판
          </h3>
          <p>
            {r.snapshot.classroom.name} ·{" "}
            {r.published_at ? "학생에게 공개한 판" : "선생님만 보는 판"} ·{" "}
            {formatKoreanDate(r.created_at)}
          </p>
          <details>
            <summary>보고서 내용 확인</summary>
            <dl>
              {Object.entries(reportCounts).map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {r.snapshot.counts[key as keyof typeof r.snapshot.counts]}
                  </dd>
                </div>
              ))}
            </dl>
            <p style={{ whiteSpace: "pre-wrap" }}>
              {r.teacher_note || "별도 의견 없음"}
            </p>
            {r.snapshot.sources?.map((v) => (
              <article className="hub-record" key={v.key}>
                <h4>
                  {v.title} ·{" "}
                  {v.kind === "paper"
                    ? "종이 활동 관찰"
                    : v.version + "번째 활동"}
                </h4>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {v.body}
                </p>
              </article>
            ))}
            {r.snapshot.works.map((w) => (
              <div key={w.id}>
                <h4>
                  {w.title} · {w.version}번째 글
                </h4>
                {w.version > 1 && (
                  <details>
                    <summary>처음 제출한 글과 비교</summary>
                    <p
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {w.firstBody}
                    </p>
                  </details>
                )}
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {w.body}
                </p>
              </div>
            ))}
          </details>
          {teacher && (
            <div>
              <p>
                상태:{" "}
                {
                  {
                    draft: "초안",
                    reviewed: "검토 완료",
                    published: "학생 공개",
                    withdrawn: "공개 취소",
                  }[r.review_state ?? (r.published_at ? "published" : "draft")]
                }
              </p>
              <label className="hub-check">
                <input
                  type="checkbox"
                  checked={!!confirmed[r.id]}
                  onChange={(e) =>
                    setConfirmed((old) => ({
                      ...old,
                      [r.id]: e.target.checked,
                    }))
                  }
                />
                {r.title} {r.version}판의 원문·수치·의견과 학생 공개 범위를
                확인했습니다
              </label>
              <button
                className="button button-outline"
                disabled={!!busy || !confirmed[r.id]}
                onClick={async () => {
                  const action =
                    r.review_state === "published"
                      ? "withdraw"
                      : r.review_state === "reviewed"
                        ? "publish"
                        : "review";
                  const key =
                    r.id + ":" + action + ":" + (r.review_revision ?? 1);
                  keys.current[key] ??= crypto.randomUUID();
                  setBusy(r.id);
                  setMessage("");
                  try {
                    const result = await reviewReport({
                      id: r.id,
                      action,
                      revision: r.review_revision ?? 1,
                      requestId: keys.current[key],
                      confirmed: true,
                    });
                    setMessage(result.message);
                    if (result.ok) {
                      setConfirmed((old) => ({ ...old, [r.id]: false }));
                      router.refresh();
                    }
                  } catch {
                    setMessage(
                      "연결이 끊겼어요. 같은 작업으로 다시 시도해 주세요.",
                    );
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {r.review_state === "published"
                  ? "학생 공개 취소"
                  : r.review_state === "reviewed"
                    ? "학생에게 공개"
                    : "이 판 검토 완료"}
              </button>
            </div>
          )}
          <div className="hub-inline">
            {[
              ["docx", "Word 저장"],
              ["print", "인쇄 · PDF 저장"],
              ["csv", "CSV 저장"],
              ...(teacher
                ? [
                    ["google-docs", "Google Docs 저장"],
                    ["google-sheets", "Google Sheets 저장"],
                  ]
                : []),
            ].map(([format, label]) => (
              <button
                key={format}
                className="button button-outline"
                disabled={!!busy}
                onClick={() => void download(r, format)}
              >
                {busy === r.id ? "처리 중…" : label}
              </button>
            ))}
          </div>
        </article>
      ))}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {url && (
        <a
          className="text-link"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          만든 Google 보고서 열기 →
        </a>
      )}
      {teacher && (
        <p>
          Google 내보내기는{" "}
          <Link href="/hub?tab=exports">
            교사 Google 계정을 연결한 브라우저
          </Link>
          에서 이용합니다.
        </p>
      )}
      <Link className="text-link" href="/account/records">
        내보낸 사본의 보관·삭제 관리 →
      </Link>
    </section>
  );
}
