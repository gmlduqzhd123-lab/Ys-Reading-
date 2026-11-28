"use client";
import { GoogleConnectionCheck } from "./google-connection-check";
import { BatchExports } from "./batch-exports";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { HubData } from "@/lib/hub-data";
import { Empty, Panel } from "./shared";
import { googleCallbackNotice } from "@/lib/google-errors";
import { exportSelectionKey, readExportSelection } from "@/lib/export-selection";
type ExportMethod = "file" | "google" | "batch";

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
  const requestedMethod = useSearchParams().get("exportMode");
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [kind, setKind] = useState<"reading" | "writing" | "drafts">("reading"),
    [selected, setSelected] = useState<string[]>([]),
    [title, setTitle] = useState("나의 책숲 기록"),
    [message, setMessage] = useState(""),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [includeNames, setIncludeNames] = useState(false);
  const [requiresReconnect, setRequiresReconnect] = useState(false);
  const connectionNotice = googleCallbackNotice(
    googleNotice,
    google.connected && !requiresReconnect,
  );
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
  const method: ExportMethod = requestedMethod === "batch" ? "batch"
    : teacher && (requestedMethod === "google" || (!requestedMethod && googleNotice === "connected")) ? "google" : "file";
  const [batchOpened, setBatchOpened] = useState(method === "batch");
  const classroom = data.selectedClassroom ?? "";
  const selectionKey = exportSelectionKey(data.profile.id, classroom, data.page);
  const connectHref = "/api/google/connect?" + new URLSearchParams({ classroom, page: String(data.page) });
  useEffect(() => {
    if (!teacher || !googleNotice || !["connected", "cancelled", "school-policy", "expired", "configuration", "failed"].includes(googleNotice)) return;
    try {
      const raw = sessionStorage.getItem(selectionKey);
      sessionStorage.removeItem(selectionKey);
      const saved = readExportSelection(raw, Date.now(), {
        reading: new Set(data.logs.map(record => record.id)),
        writing: new Set(data.submissions.map(record => record.id)),
      });
      if (!saved) return;
      setKind(saved.kind);
      setTitle(saved.title);
      setSelected(saved.ids);
      setIncludeNames(false);
      key.current = {};
      setMessage(saved.omitted
        ? "현재 내보낼 수 있는 기록을 선택했어요. 목록에서 선택을 확인해 주세요."
        : "연결 전에 선택한 기록과 제목을 불러왔어요.");
    } catch {}
  }, [teacher, googleNotice, selectionKey, data.logs, data.submissions]);

  function rememberSelection(event: MouseEvent<HTMLAnchorElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || kind === "drafts") return;
    try {
      sessionStorage.setItem(selectionKey, JSON.stringify({ kind, title, ids: selected, savedAt: Date.now() }));
    } catch {}
  }
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
  function chooseMethod(value: ExportMethod) {
    if (value === "batch") setBatchOpened(true);
    const next = new URL(window.location.href);
    next.searchParams.set("exportMode", value);
    window.history.replaceState(null, "", next.pathname + next.search + next.hash);
  }

  async function disconnect(revoke: boolean) {
    if (busy || (revoke && !window.confirm("책숲의 Google 접근 권한을 회수할까요? 다른 브라우저에서도 다시 승인이 필요할 수 있습니다."))) return;
    setBusy(true);
    try {
      const response = await fetch("/api/google/disconnect", {
        method: "POST",
        ...(revoke ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revoke: true }) } : {}),
      });
      if (!response.ok) throw Error((await response.json()).error ?? "Google 연결 상태를 바꾸지 못했어요.");
      setUrl("");
      setMessage(revoke ? "Google 접근 권한을 회수했어요." : "이 브라우저의 Google 연결을 해제했어요.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google 연결 상태를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const methods = [
    { value: "file", label: "파일 저장" },
    ...(teacher ? [{ value: "google", label: "Google Drive" }] as const : []),
    { value: "batch", label: teacher ? "학급 묶음" : "기간별 묶음" },
  ] as const;
  const canDownload = !busy && interactive && selected.length > 0 && !!title.trim();
  return (
    <>
      <Panel title="기록·글 내보내기">
        <fieldset className="export-methods" disabled={!interactive || busy}>
          <legend>저장 방법</legend>
          {methods.map(({ value, label }) => (
            <label key={value}>
              <input type="radio" name="export-method" checked={method === value} onChange={() => chooseMethod(value)} />
              {label}
            </label>
          ))}
        </fieldset>
        <Link className="text-link" href="/account/records">내보낸 사본의 보관·삭제 확인 →</Link>
        {connectionNotice && <p className="notice" role="status">{connectionNotice}</p>}
        {method !== "batch" && (
          <div id="file-export-choice" className="export-workspace" tabIndex={-1}>
            <div>
              <label className="field">
                기록 종류
                <select disabled={busy || !interactive} value={kind} onChange={(e) => {
                  setKind(e.target.value as typeof kind);
                  setSelected([]);
                  key.current = {};
                }}>
                  <option value="reading">독서 기록장</option>
                  <option value="writing">제출한 글 · 완료 작품</option>
                  {!teacher && <option value="drafts">작성 중인 글 · 내 초안</option>}
                </select>
              </label>
              {!rows.length ? <Empty>아직 내보낼 기록이 없습니다.</Empty> : (
                <div className="export-record-list" role="region" aria-label="내보낼 기록 선택" tabIndex={0}>
                  {rows.map(row => (
                    <label className="hub-check hub-record" key={row.id}>
                      <input type="checkbox" disabled={busy || !interactive} checked={selected.includes(row.id)}
                        onChange={(event) => {
                          const chosen = event.target.checked;
                          setSelected(old => chosen ? [...old, row.id] : old.filter(id => id !== row.id));
                          key.current = {};
                        }} />
                      {selected.includes(row.id) && <strong>{selected.indexOf(row.id) + 1}.</strong>}
                      <span>
                        {row.title}
                        <small> · {row.meta}{teacher ? ` · ${data.students.find(person => person.id === row.student)?.display_name ?? "학생"}` : ""}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <section className="export-confirm" aria-labelledby="export-summary-heading">
              <h3 id="export-summary-heading">내보내기 설정</h3>
              <p role="status"><strong>선택한 기록 {selected.length}건</strong></p>
              <label className="field">
                기록장·작품집 제목
                <input disabled={busy || !interactive} value={title} maxLength={100} required
                  onChange={(e) => { setTitle(e.target.value); key.current = {}; }} />
              </label>
              <label className="hub-check">
                <input type="checkbox" disabled={busy || !interactive} checked={includeNames}
                  onChange={(e) => { setIncludeNames(e.target.checked); key.current = {}; }} />
                파일에 작성자 표시 이름 포함
              </label>
              {method === "file" && (
                <div className="button-row">
                  <button className="button button-primary" disabled={!canDownload} onClick={() => void download("docx")}>Word 파일 저장</button>
                  <button className="button button-outline" disabled={!canDownload} onClick={() => void download("print")}>인쇄·PDF 저장</button>
                  <button className="button button-outline" disabled={!canDownload} onClick={() => void download("csv")}>표로 저장 · CSV</button>
                </div>
              )}
              {method === "google" && (
                <>
                  <p className="form-help">연결한 교사의 드라이브 ‘책숲 기록’ 폴더에 저장합니다.</p>
                  {!google.configured ? (
                    <p className="notice">학교의 Google 연결을 준비하고 있어요.</p>
                  ) : !google.connected || requiresReconnect ? (
                    <a className="button button-primary" href={connectHref} onClick={rememberSelection}>
                      {requiresReconnect ? "Google 계정 다시 연결" : "교사 Google 계정 연결"}
                    </a>
                  ) : (
                    <>
                      <div className="button-row">
                        <button className="button button-primary" disabled={!canDownload} onClick={() => void download("google-docs")}>Google Docs로 저장</button>
                        <button className="button button-outline" disabled={!canDownload} onClick={() => void download("google-sheets")}>Google Sheets로 저장</button>
                      </div>
                      <details className="export-connection">
                        <summary>Google 연결 관리</summary>
                        <GoogleConnectionCheck />
                        <div className="button-row">
                          {!busy && <a className="button button-outline" href={connectHref} onClick={rememberSelection}>Google 계정 다시 연결</a>}
                          <button className="button button-outline" disabled={busy} onClick={() => void disconnect(false)}>이 브라우저 연결 해제</button>
                          <button className="button button-outline" disabled={busy} onClick={() => void disconnect(true)}>Google 접근 권한 회수</button>
                        </div>
                      </details>
                    </>
                  )}
                  <button type="button" className="button button-outline" disabled={busy} onClick={() => chooseMethod("file")}>파일 저장으로 바꾸기</button>
                </>
              )}
              {busy && <p role="status">요청을 처리하고 있어요…</p>}
              {message && <p role="status">{message}</p>}
              {method === "google" && url && (
                <a className="button button-outline" href={url} target="_blank" rel="noopener noreferrer">만든 Google 파일 열기</a>
              )}
            </section>
          </div>
        )}
      </Panel>
      {(batchOpened || method === "batch") && (
        <div hidden={method !== "batch"}>
          <BatchExports owner={data.profile.id} teacher={teacher} classes={data.availableClasses ?? data.classes} selected={classroom} />
        </div>
      )}
    </>
  );
}
