"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HubData } from "@/lib/hub-data";
import { Empty, Panel } from "./shared";
import { googleCallbackNotice } from "@/lib/google-errors";
export function Exports({
  data,
  google,
  googleNotice,
}: {
  data: HubData;
  google: { configured: boolean; connected: boolean };
  googleNotice?: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"reading" | "writing" | "drafts">("reading"),
    [selected, setSelected] = useState<string[]>([]),
    [title, setTitle] = useState("나의 책숲 기록"),
    [message, setMessage] = useState(""),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [includeNames, setIncludeNames] = useState(false);
  const [requiresReconnect, setRequiresReconnect] = useState(false);
  const connectionNotice = googleCallbackNotice(googleNotice, google.connected && !requiresReconnect);
  const key = useRef<Record<string, string>>({});
  const rows =
    kind === "reading"
      ? data.logs.map((l) => ({
          id: l.id,
          title: l.book.title,
          meta: l.read_on,
          student: l.student_id,
        }))
      : kind === "drafts"
        ? data.drafts.map((d) => ({
            id: d.id,
            title: d.title || "작성 중인 글",
            meta: "작성 중인 초안",
            student: d.student_id,
          }))
        : data.submissions.map((s) => ({
            id: s.id,
            title: s.title,
            meta: `${s.version}번째 글`,
            student: s.student_id,
          }));
  const teacher = data.profile.role === "teacher";
  async function download(format: string) {
    if (busy) return;
    if (!selected.length) {
      setMessage("내보낼 기록을 먼저 선택해 주세요.");
      return;
    }
    const printWindow =
      format === "print" ? window.open("about:blank", "_blank") : null;
    setBusy(true);
    setMessage("");
    setUrl("");
    key.current[format] ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          ids: selected,
          title,
          format,
          requestId: key.current[format],
          includeNames,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        if (error.requiresReconnect === true) setRequiresReconnect(true);
        throw new Error(error.error ?? "내보내지 못했어요.");
      }
      if (format.startsWith("google-")) {
        const result = await response.json();
        setUrl(result.url);
        setMessage("Google 파일을 만들었어요. 아래 링크에서 열 수 있습니다.");
      } else {
        const blob = await response.blob();
        const href = URL.createObjectURL(blob);
        if (format === "print" && printWindow) {
          printWindow.location.href = href;
          setMessage(
            "새 창에서 ‘인쇄 · PDF로 저장’을 눌러 PDF 저장을 선택하세요.",
          );
        } else {
          const a = document.createElement("a");
          a.href = href;
          a.download = `${title.replace(/[<>:"/\\|?*]/g, "_")}.${format === "docx" ? "docx" : format === "csv" ? "csv" : "html"}`;
          a.click();
          setMessage(
            format === "print"
              ? "인쇄 창이 차단되어 HTML 파일로 저장했어요. 파일을 열어 인쇄·PDF 저장을 이용하세요."
              : "파일을 저장했어요.",
          );
        }
        setTimeout(() => URL.revokeObjectURL(href), 60000);
      }
    } catch (e) {
      printWindow?.close();
      setMessage(e instanceof Error ? e.message : "연결 상태를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {connectionNotice && <p className="notice" role="status">{connectionNotice}</p>}
      <Panel title="내 기록을 파일로 간직하기">
        <p>
          선택한 순서로 독서 기록장이나 작품집을 만듭니다. 내보낸 파일은 지금
          시점의 사본이며, 원본을 수정해도 자동으로 바뀌지 않아요.
        </p>
        <label className="field">
          기록 종류
          <select
            disabled={busy}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              setSelected([]);
              key.current = {};
            }}
          >
            <option value="reading">독서 기록장</option>
            <option value="writing">제출한 글 · 완료 작품</option>
            {!teacher && <option value="drafts">작성 중인 글 · 내 초안</option>}
          </select>
        </label>
        <label className="field">
          기록장·작품집 제목
          <input
            disabled={busy}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              key.current = {};
            }}
            maxLength={100}
            required
          />
        </label>
        <label className="hub-check">
          <input
            type="checkbox"
            disabled={busy}
            checked={includeNames}
            onChange={(e) => {
              setIncludeNames(e.target.checked);
              key.current = {};
            }}
          />
          파일에 작성자 표시 이름 포함
        </label>
        {!rows.length && <Empty>아직 내보낼 기록이 없습니다.</Empty>}
        {rows.map((r) => (
          <label className="hub-check hub-record" key={r.id}>
            <input
              type="checkbox"
              disabled={busy}
              checked={selected.includes(r.id)}
              onChange={(e) => {
                setSelected((old) =>
                  e.target.checked
                    ? [...old, r.id]
                    : old.filter((id) => id !== r.id),
                );
                key.current = {};
              }}
            />
            {selected.includes(r.id) && (
              <strong>{selected.indexOf(r.id) + 1}.</strong>
            )}
            <span>
              {r.title}
              <small>
                {" "}
                · {r.meta}
                {teacher
                  ? ` · ${data.students.find((p) => p.id === r.student)?.display_name ?? "학생"}`
                  : ""}
              </small>
            </span>
          </label>
        ))}
        <div className="hub-inline">
          <button
            className="button button-primary"
            disabled={busy || !selected.length || !title.trim()}
            onClick={() => void download("docx")}
          >
            Word 파일 저장
          </button>
          <button
            className="button button-outline"
            disabled={busy || !selected.length || !title.trim()}
            onClick={() => void download("print")}
          >
            인쇄·PDF 저장
          </button>
          <button
            className="button button-outline"
            disabled={busy || !selected.length || !title.trim()}
            onClick={() => void download("csv")}
          >
            표로 저장 · CSV
          </button>
        </div>
        {busy && <p role="status">파일을 준비하고 있어요…</p>}
        {message && <p role="status">{message}</p>}
        {url && (
          <a
            className="button button-outline"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            만든 Google 파일 열기
          </a>
        )}
      </Panel>
      <Panel title="Google 도구로 내보내기">
        {teacher ? (
          <>
            <p>
              연결한 교사의 Google Drive에 ‘책숲 기록’ 폴더를 만들고 선택한
              기록을 저장합니다. 공유 범위는 생성한 파일에서 확인해 주세요.
            </p>
            {!google.configured ? (
              <div className="notice">
                학교의 Google 연결을 준비하고 있어요. Word·인쇄·PDF·CSV 저장은
                계속 이용할 수 있습니다.
              </div>
            ) : !google.connected || requiresReconnect ? (
              <a className="button button-primary" href="/api/google/connect">
                {requiresReconnect ? "Google 계정 다시 연결" : "교사 Google 계정 연결"}
              </a>
            ) : (
              <>
                <p className="status-pill">Google 연결됨</p>
                <div className="hub-inline">
                  <button
                    className="button button-primary"
                    disabled={busy || !selected.length || !title.trim()}
                    onClick={() => void download("google-docs")}
                  >
                    Google Docs로 저장
                  </button>
                  <button
                    className="button button-outline"
                    disabled={busy || !selected.length || !title.trim()}
                    onClick={() => void download("google-sheets")}
                  >
                    Google Sheets로 저장
                  </button>
                  {!busy && <a className="button button-outline" href="/api/google/connect">Google 계정 다시 연결</a>}
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={async () => {
                      const r = await fetch("/api/google/disconnect", {
                        method: "POST",
                      });
                      if (r.ok) {
                        router.refresh();
                        setMessage(
                          "이 브라우저의 Google 연결을 해제했어요. 기존 파일은 유지됩니다.",
                        );
                      } else
                        setMessage(
                          "연결을 해제하지 못했어요. 다시 시도해 주세요.",
                        );
                    }}
                  >
                    이 브라우저 연결 해제
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <p>
            개인 Google 계정 없이 파일을 저장할 수 있어요. Google Docs·Sheets로
            옮겨야 할 때는 선생님이 학급 기록을 선택해 내보낼 수 있습니다.
          </p>
        )}
      </Panel>
    </>
  );
}
