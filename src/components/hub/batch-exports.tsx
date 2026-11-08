"use client";
import { useEffect, useRef, useState } from "react";
import { batchExportAction } from "@/app/hub/completion-actions";
import { createClient } from "@/lib/supabase/client";
type Batch = {
  id: string;
  title: string;
  total: number;
  done: number;
  parts: number;
  format: string;
};
type Part = {
  id: string;
  owner: string;
  title: string;
  kind: string;
  format: string;
  includeNames: boolean;
  requestId: string;
  ids: string[];
  part: number;
  parts: number;
  completed: Record<string, { url: string | null }>;
};
export function BatchExports({
  owner,
  teacher,
  classes,
  selected,
}: {
  owner: string;
  teacher: boolean;
  classes: { id: string; name: string }[];
  selected: string;
}) {
  const [kind, setKind] = useState("reading"),
    [selection, setSelection] = useState("all"),
    [format, setFormat] = useState("docx"),
    [classroom, setClass] = useState(selected),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [title, setTitle] = useState("학기 책숲 기록"),
    [names, setNames] = useState(false),
    [batches, setBatches] = useState<Batch[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [links, setLinks] = useState<{ url: string; label: string }[]>([]);
  const [interactive, setInteractive] = useState(false),
    [blocked, setBlocked] = useState(false);
  const active = useRef(true),
    pause = useRef(false),
    request = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    setInteractive(true);
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((event, session) => {
      if (
        event === "SIGNED_OUT" ||
        (session?.user && session.user.id !== owner)
      ) {
        active.current = false;
        pause.current = true;
        request.current?.abort();
        setBatches([]);
        setLinks([]);
        setBlocked(true);
      }
    });
    void batchExportAction(owner, { action: "list" })
      .then((v) => {
        if (active.current) setBatches(v);
      })
      .catch(() => {});
    return () => {
      active.current = false;
      pause.current = true;
      request.current?.abort();
      subscription.unsubscribe();
    };
  }, [owner]);
  async function refresh() {
    const v = await batchExportAction(owner, { action: "list" });
    if (active.current) setBatches(v);
  }
  async function run(id: string, recreate = false) {
    setBusy(true);
    pause.current = false;
    setLinks([]);
    try {
      const first: Part = await batchExportAction(owner, {
        action: "part",
        id,
        part: 0,
      });
      const localFiles: {name:string;data:ArrayBuffer}[]=[];
      let bytes=0;
      for (let n = 0; n < first.parts; n++) {
        if (!active.current || pause.current) break;
        if (first.format.startsWith("google-") && first.completed[n] && !recreate) {
          if (first.completed[n].url)
            setLinks((old) => [
              ...old,
              { url: first.completed[n].url!, label: `${n + 1}번 Google 파일` },
            ]);
          continue;
        }
        const part: Part =
          n === 0
            ? first
            : await batchExportAction(owner, { action: "part", id, part: n });
        if (!active.current) break;
        setMessage(`${n + 1} / ${part.parts}번째 파일 생성 중…`);
        request.current = new AbortController();
        const response = await fetch("/api/export", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Bookforest-Actor": owner,
          },
          signal: request.current.signal,
          body: JSON.stringify({
            kind: part.kind === "draft" ? "drafts" : part.kind,
            ids: part.ids,
            format: part.format,
            title: `${part.title.slice(0, 80)} (${n + 1}-${part.parts})`,
            requestId: part.requestId,
            includeNames: part.includeNames,
            batchId:id,
            part:n,
          }),
        });
        if (!active.current) break;
        if (!response.ok)
          throw Error((await response.json()).error ?? "내보내지 못했어요.");
        let url: string | null = null;
        if (part.format.startsWith("google-")) {
          url = (await response.json()).url;
          setLinks((old) => [
            ...old,
            { url: url!, label: `${n + 1}번 Google 파일` },
          ]);
        } else {
          const file = await response.arrayBuffer();
          if (!active.current) break;
          bytes+=file.byteLength;
          if(bytes>64*1024*1024)throw Error("파일이 커요. 날짜 범위를 나누어 새 묶음을 만들어 주세요.");
          localFiles.push({name:`책숲-${n+1}-${part.parts}.${part.format}`,data:file});
        }
        await batchExportAction(owner, {
          action: "part",
          id,
          part: n,
          done: true,
          url,
        });
        await refresh();
      }
      if(active.current&&!pause.current&&localFiles.length===first.parts){
        // Revalidate access to every part immediately before releasing the ZIP.
        for(let n=0;n<first.parts;n++){
          const r=await createClient().rpc("check_export_part_access",{p_id:id,p_part:n});
          if(r.error||!active.current)throw Error("기록 접근 권한이 바뀌었어요. 새 묶음을 만들어 주세요.");
        }
        const {default:JSZip}=await import("jszip"),zip=new JSZip();
        for(const file of localFiles)zip.file(file.name,file.data);
        const blob=await zip.generateAsync({type:"blob",compression:"STORE"});
        if(!active.current)return;
        const href=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=href;a.download="책숲-기록묶음.zip";a.click();
        setTimeout(()=>URL.revokeObjectURL(href),60000);
      }
      if (active.current)
        setMessage(
          pause.current
            ? "일시 중지했어요. 생성한 부분 다음부터 이어갈 수 있습니다."
            : "분할 파일 생성을 마쳤어요. 다운로드 목록 또는 Google 링크에서 파일을 확인해 주세요.",
        );
    } catch (e) {
      if (active.current)
        setMessage(
          (e instanceof Error ? e.message : "연결을 확인해 주세요.") +
            " 같은 묶음으로 다시 시도할 수 있어요. 동의·권한·기록 삭제 상태가 바뀌었다면 접근 가능한 기록으로 새 묶음을 만들어 주세요.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  if (blocked)
    return (
      <p role="alert">
        로그인 계정이 바뀌었어요. 현재 계정으로 화면을 다시 열어 주세요.
      </p>
    );
  return (
    <section className="panel">
      <h2>학급·학기 기록 한 번에 내보내기</h2>
      <p>
        날짜와 학급으로 기록 목록을 정하고 25건씩 파일을 만듭니다. 최대
        10,000건, 7일 동안 보관합니다. 묶음을 만들 때 내용을 고정하며 다운로드마다 현재 동의·권한을 다시 확인해요. Word·CSV는 ZIP 하나로 받습니다.
      </p>
      <fieldset
        disabled={!interactive}
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        <form
          className="hub-form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void batchExportAction(owner, {
              action: "start",
              title,
              kind,
              format,
              includeNames: names,
              selection,
              classroom,
              from,
              to,
            })
              .then((id) => run(id))
              .catch((e) => {
                setMessage(e.message);
                setBusy(false);
              });
          }}
        >
          <label className="field">
            묶음 제목
            <input
              value={title}
              required
              maxLength={100}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            내보낼 학급
            <select
              value={classroom}
              disabled={busy}
              onChange={(e) => setClass(e.target.value)}
            >
              <option value="">접근 가능한 모든 학급</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            묶을 기록
            <select
              disabled={busy}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="reading">독서 기록</option>
              <option value="writing">제출한 글 · 모든 버전</option>
              {!teacher && <option value="draft">내 글 초안</option>}
            </select>
          </label>
          <label className="field">
            분할 파일 형식
            <select
              disabled={busy}
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="docx">Word</option>
              <option value="csv">CSV</option>
              {teacher && (
                <>
                  <option value="google-docs">Google Docs</option>
                  <option value="google-sheets">Google Sheets</option>
                </>
              )}
            </select>
          </label>
          <label className="field">기록 버전·확인 조건
            <select value={selection} disabled={busy} onChange={e=>setSelection(e.target.value)}>
              <option value="all">모든 기록·제출 버전</option>
              <option value="latest">제출 글은 최신 버전만</option>
              <option value="completed">선생님 확인·검토 완료만</option>
            </select>
          </label>
          <label className="field">
            기록 시작 날짜
            <input
              type="date"
              value={from}
              disabled={busy}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field">
            기록 끝 날짜
            <input
              type="date"
              min={from}
              value={to}
              disabled={busy}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="hub-check">
            <input
              type="checkbox"
              checked={names}
              disabled={busy}
              onChange={(e) => setNames(e.target.checked)}
            />
            파일에 작성자 표시 이름 포함
          </label>
          <button
            className="button button-primary"
            disabled={busy || !title.trim()}
          >
            조건에 맞는 묶음 만들기
          </button>
        </form>
        {busy && (
          <button
            className="button button-outline"
            onClick={() => {
              pause.current = true;
            }}
          >
            현재 파일 이후 일시 중지
          </button>
        )}
        <p className="form-help">
          ZIP은 모든 부분을 준비한 뒤 한 번에 다운로드합니다. 중지·재접속하면 고정한 내용으로 ZIP 전체를 다시 만들어요. 생성 건수는 기기 저장 확인이 아닙니다. Google은 교사 계정을 먼저 연결해 주세요. 이전 방식 묶음은 새로 만들어 주세요.
        </p>
        {message && <p role="status">{message}</p>}
        {links.map((l) => (
          <p key={l.url}>
            <a href={l.url} target="_blank" rel="noreferrer">
              {l.label} 열기
            </a>
          </p>
        ))}
        {batches.map((b) => (
          <article key={b.id}>
            <h3>{b.title}</h3>
            <p>
              {b.total}건 · {b.done}/{b.parts}개 파일 생성
            </p>
            <button
              disabled={busy}
              className="button button-outline"
              onClick={() => void run(b.id)}
            >
              {b.format.startsWith("google-")?"남은 Google 파일 이어서 생성":"ZIP 다시 받기"}
            </button>
          </article>
        ))}
      </fieldset>
    </section>
  );
}
