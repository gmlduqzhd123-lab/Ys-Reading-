"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createReport } from "@/app/reports/actions";
import {
  reportCounts,
  type GrowthReport,
  type ReportState,
} from "@/lib/growth-report";
export function ReportComposer({ state }: { state: ReportState }) {
  const router = useRouter(),
    [title, setTitle] = useState(state.student.name + "의 책숲 성장 기록"),
    [note, setNote] = useState(""),
    [works, setWorks] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState(false),
    [publish, setPublish] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef(crypto.randomUUID());
  function changed() {
    request.current = crypto.randomUUID();
    setConfirmed(false);
  }
  return (
    <section className="panel">
      <h2>{state.student.name}의 보고서 준비</h2>
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
      <fieldset disabled={busy}>
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
          초기화됩니다.
        </p>
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
        <label className="hub-check">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => {
              setPublish(e.target.checked);
              changed();
            }}
          />
          저장한 판을 이 학생에게 공개합니다
        </label>
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
                title,
                note,
                publish,
                confirmed,
                version: state.latestVersion,
                requestId: request.current,
              });
              setMessage(r.message);
              if (r.ok) {
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
export function ReportArchive({
  reports,
  teacher,
}: {
  reports: GrowthReport[];
  teacher: boolean;
}) {
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
            {new Date(r.created_at).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
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
