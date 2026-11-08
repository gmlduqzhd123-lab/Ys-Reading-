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
  zip_state?:string|null;
  zip_done?:number;
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
  const creation=useRef<{fingerprint:string;id:string}|null>(null);
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
  const running=batches.some(b=>["queued","running"].includes(b.zip_state??""));
  useEffect(()=>{if(!running||blocked)return;const update=()=>{if(active.current&&document.visibilityState==="visible"&&navigator.onLine)void refresh().catch(()=>{});};const timer=setInterval(update,2500);document.addEventListener("visibilitychange",update);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",update);};},[running,blocked,owner]);
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
      if(!first.format.startsWith("google-")){
        await batchExportAction(owner,{action:"zip",id,operation:"start"});
        if(active.current){setMessage("ZIP 생성을 서버에 등록했어요. 탭을 닫아도 계속되며 완료 후 아래에서 받을 수 있습니다.");await refresh();}return;
      }
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
            const fingerprint=JSON.stringify({title,kind,format,names,classroom,from,to,selection});
            if(creation.current?.fingerprint!==fingerprint)creation.current={fingerprint,id:crypto.randomUUID()};
            void batchExportAction(owner, {
              action: "start",
              title,
              kind,
              format,
              includeNames: names,
              selection,
              requestId:creation.current.id,
              classroom,
              from,
              to,
            })
              .then((id) => {creation.current=null;return run(id);})
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
          ZIP은 서버에서 분할 생성하고 보관합니다. 재접속 후 완료 파일을 받을 수 있으며 다운로드할 때 현재 동의·권한을 다시 확인해요. 생성 건수는 기기 저장 확인이 아닙니다. Google은 교사 계정을 먼저 연결해 주세요.
        </p>
      <p className="form-help">계정마다 7일 보관 묶음 10개·하루 새 묶음 20개·원문 합계 64MiB까지 지원합니다. 같은 요청 재시도는 기존 묶음을 이용해요.</p>
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
              {b.total}건 · {b.format.startsWith("google-")?b.done:(b.zip_done??0)}/{b.parts}개 파일 생성
            </p>
            {b.zip_state==="complete"&&!b.format.startsWith("google-")?<a className="button button-primary" href={`/api/exports/zip?batch=${b.id}`} download>ZIP 받기</a>:<button
              disabled={busy}
              className="button button-outline"
              onClick={() => void run(b.id)}
            >
              {b.format.startsWith("google-")?"남은 Google 파일 이어서 생성":["queued","running"].includes(b.zip_state??"")?"서버 작업 상태 확인":"ZIP 생성 이어가기"}
            </button>}
            {["queued","running"].includes(b.zip_state??"")&&<><p role="status">서버에서 ZIP 파일을 준비하고 있어요. 이 화면을 닫아도 작업은 계속됩니다.</p><button className="button button-outline" onClick={async()=>{try{await batchExportAction(owner,{action:"zip",id:b.id,operation:"cancel"});await refresh();}catch(e){setMessage(e instanceof Error?e.message:"중단을 확인하지 못했어요.");}}}>ZIP 생성 중단</button></>}
            {b.zip_state==="failed"&&<p role="alert">ZIP 생성이 중단됐어요. 현재 권한과 보관 용량을 확인한 뒤 이어서 생성해 주세요.</p>}
            <button className="button button-outline" disabled={busy} onClick={async()=>{if(!window.confirm("이 내보내기 묶음과 임시 파일을 지울까요? 원래 독서 기록과 글은 유지됩니다."))return;setBusy(true);try{await batchExportAction(owner,{action:"discard",id:b.id});await refresh();}catch(e){setMessage(e instanceof Error?e.message:"연결을 확인해 주세요.");}finally{setBusy(false);}}}>이 묶음 삭제</button>
          </article>
        ))}
      </fieldset>
    </section>
  );
}
