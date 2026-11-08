"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import { hubCommand } from "@/app/hub/actions";
import { readingDraftAction } from "@/app/hub/reading-draft-actions";
import {
  readingDraftPayload,
  readLocalReadingDraft,
  type ReadingDraftPayload,
} from "@/lib/reading-draft";
import { readingSchema, koreanDay, type Book } from "@/lib/hub";
import type { HubData, ReadingLog } from "@/lib/hub-data";
import { GuidedThought } from "@/components/participation/guided-thought";
export function ReadingEditor({
  data,
  book,
  edit,
  onSaved,
}: {
  data: HubData;
  book: Book | null;
  edit: ReadingLog | null;
  onSaved: () => void;
}) {
  const classes = data.classes.filter((c) => c.term_state !== "archived"),
    router = useRouter();
  const initial = (): ReadingDraftPayload => ({
    title: book?.title ?? edit?.book.title ?? "",
    author: book?.author ?? edit?.book.author ?? "",
    publisher: book?.publisher ?? edit?.book.publisher ?? "",
    isbn: book?.isbn ?? edit?.book.isbn ?? "",
    thumbnail: book?.thumbnail ?? edit?.book.thumbnail ?? "",
    readOn: edit?.read_on ?? koreanDay(),
    status: edit?.status ?? "reading",
    thought: edit?.thought ?? "",
    question: edit?.question ?? "",
    guidance: JSON.stringify({
      mode: edit?.thought ? "free" : (classes.find(c=>c.id===(edit?.classroom_id??classes[0]?.id))?.reading_guidance??"line"),
      scene: "",
      feeling: "",
      idea: "",
    }),
  });
  const [classroom, setClassroom] = useState(
      edit?.classroom_id ?? classes[0]?.id ?? "",
    ),
    [value, setValue] = useState(initial),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [candidate, setCandidate] = useState<ReadingDraftPayload | null>(null),
    [loaded, setLoaded] = useState(false),
    [conflict, setConflict] = useState(false),
    [busy, setBusy] = useState(false),
    [local, setLocal] = useState(false),
    [retry, setRetry] = useState(0),
    [composing, setComposing] = useState(false),[blocked,setBlocked]=useState(false);
  const revision = useRef(0),
    generation = useRef(0),
    request = useRef<{ hash: string; id: string } | null>(null),
    formalRequest = useRef<{ hash: string; id: string } | null>(null),
    latest = useRef(value),
    inFlight = useRef<Promise<unknown> | null>(null);
  latest.current = value;
  const context = classroom + ":" + (edit?.id ?? "new"),
    storageKey =
      "bookforest.reading-recovery:" + data.profile.id + ":" + context;
  const firstClassroom=classes[0]?.id;
  useEffect(()=>{const {data:{subscription}}=createClient().auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"||session?.user&&session.user.id!==data.profile.id){generation.current++;setBlocked(true);setDirty(false);try{sessionStorage.removeItem(storageKey);}catch{}}});return()=>subscription.unsubscribe();},[data.profile.id,storageKey]);
  useEffect(()=>{if(!classroom&&firstClassroom)setClassroom(firstClassroom);},[classroom,firstClassroom]);
  useEffect(() => {
    let active = true;
    generation.current++;
    setLoaded(false);
    setCandidate(null);
    setConflict(false);
    revision.current = 0;
    request.current = null;
    if (!classroom) return;
    readingDraftAction({ owner:data.profile.id,action: "load", classroom, record: edit?.id ?? null })
      .then((r) => {
        if (!active) return;
        revision.current = r.draft?.revision ?? 0;
        if (r.draft?.payload)
          setCandidate((previous) => previous ?? r.draft!.payload);
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setLoaded(true);
          setMessage(
            "임시 저장을 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
          );
        }
      });
    return () => {
      active = false;
      generation.current++;
    };
  }, [context]);
  useEffect(() => {
    try {
      const recovered = readLocalReadingDraft(
        sessionStorage.getItem(storageKey),
        data.profile.id,
        context,
      );
      if (recovered) setCandidate(recovered);
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    if (local && dirty)
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            user: data.profile.id,
            context,
            at: Date.now(),
            value,
          }),
        );
      } catch {
        setMessage(
          "탭 임시보관을 사용할 수 없어요. 현재 글을 파일로 저장해 주세요.",
        );
      }
  }, [local, dirty, value, storageKey, context, data.profile.id]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    const online = () => setRetry((n) => n + 1);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("online", online);
    };
  }, [dirty]);
  useEffect(() => {
    if (
      blocked || !dirty ||
      !loaded ||
      candidate ||
      conflict ||
      busy ||
      composing ||
      !classroom
    )
      return;
    const ownGeneration = generation.current;
    const timer = setTimeout(() => {
      if (inFlight.current) {
        void inFlight.current
          .catch(() => {})
          .finally(() => {
            if (generation.current === ownGeneration) setRetry((n) => n + 1);
          });
        return;
      }
      const captured = JSON.stringify(value),
        parsed = readingDraftPayload.safeParse(value);
      if (!parsed.success) return;
      if (request.current?.hash !== captured)
        request.current = { hash: captured, id: crypto.randomUUID() };
      const operation = readingDraftAction({
        owner:data.profile.id,
        action: "save",
        classroom,
        record: edit?.id ?? null,
        payload: parsed.data,
        revision: revision.current,
        request: request.current.id,
      });
      inFlight.current = operation;
      operation
        .then((r) => {
          if (generation.current !== ownGeneration) return;
          revision.current = r.revision ?? revision.current;
          if (JSON.stringify(latest.current) === captured) {
            setDirty(false);
            setMessage(
              "독서 기록을 임시 저장했어요. 아래 저장 버튼을 누르면 정식 기록에 반영됩니다.",
            );
            try {
              sessionStorage.removeItem(storageKey);
            } catch {}
          }
        })
        .catch((e) => {
          if (generation.current !== ownGeneration) return;
          if (String(e).includes("BF_STALE_REVISION")) {
            setConflict(true);
            setMessage(
              "다른 화면에서 임시 기록이 바뀌었어요. 현재 글을 파일로 보관한 뒤 최신 임시 기록을 확인해 주세요.",
            );
          } else
            setMessage(
              "임시 저장을 확인하지 못했어요. 입력 내용은 유지됩니다. 연결 후 다시 저장해 주세요.",
            );
        })
        .finally(() => {
          if (inFlight.current === operation) inFlight.current = null;
        });
    }, 1200);
    return () => {
      clearTimeout(timer);
    };
  }, [
    blocked,
    value,
    dirty,
    loaded,
    candidate,
    conflict,
    busy,
    retry,
    composing,
    classroom,
    edit?.id,
    storageKey,
  ]);
  function change(key: keyof ReadingDraftPayload, text: string) {
    setValue((old) => ({ ...old, [key]: text }));
    setDirty(true);
  }
  function file() {
    const href = URL.createObjectURL(
      new Blob(
        [value.title + "\n\n" + value.thought + "\n\n" + value.question],
        { type: "text/plain;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = href;
    a.download = "책숲-독서임시기록.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  }
  async function save() {
    if (busy || candidate || conflict) return;
    const parsed = readingSchema.safeParse({
      ...(edit ? { id: edit.id, revision: edit.revision } : {}),
      classroomId: classroom,
      book: {
        title: value.title,
        author: value.author,
        publisher: value.publisher,
        isbn: value.isbn,
        thumbnail: value.thumbnail,
      },
      readOn: value.readOn,
      status: value.status,
      thought: value.thought,
      question: value.question,
    });
    if (!parsed.success) {
      setMessage("책 제목·읽은 날짜·나의 생각과 학급을 확인해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await inFlight.current;
      const hash = JSON.stringify(parsed.data);
      if (formalRequest.current?.hash !== hash)
        formalRequest.current = { hash, id: crypto.randomUUID() };
      const r = await hubCommand({
        expectedActor:data.profile.id,
        command: "reading_save",
        payload: parsed.data,
        requestId: formalRequest.current.id,
      });
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      try {
        await readingDraftAction({
          owner:data.profile.id,
          action: "discard",
          classroom,
          record: edit?.id ?? null,
          revision: revision.current,
          request: crypto.randomUUID(),
        });
        sessionStorage.removeItem(storageKey);
      } catch {}
      setDirty(false);
      onSaved();
      router.refresh();
    } catch {
      setMessage(
        "기록 저장을 확인하지 못했어요. 입력을 유지한 채 같은 저장을 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  if(blocked)return <p role="alert">로그인 계정이 바뀌었어요. 현재 계정으로 화면을 다시 열어 주세요.</p>;
  return (
    <form
      data-reading-editor="true"
      data-hub-dirty={dirty ? "true" : "false"}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => setComposing(false)}
    >
      <p className="form-help">
        작성 중인 독서 기록은 본인만 볼 수 있게 7일간 임시 저장해요. 정식 저장
        전에는 완독 확인이나 보상이 발생하지 않습니다.
      </p>
      {candidate && (
        <aside className="notice" role="status">
          <p>
            이전에 임시 저장한 독서 기록이 있어요. 책 제목:{" "}
            {candidate.title || "아직 없음"}
          </p>
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setValue(candidate);
              setCandidate(null);
              setDirty(true);
              setMessage("임시 기록을 불러왔어요. 내용을 확인해 주세요.");
            }}
          >
            임시 독서 기록 불러오기
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setCandidate(null);
              setDirty(true);
            }}
          >
            현재 입력으로 계속 작성
          </button>
        </aside>
      )}
      <fieldset
        disabled={
          busy || !classes.length || data.profile.consent_status !== "verified"
        }
        className="hub-fieldset"
      >
        <div className="hub-form-grid">
          <label className="field">
            학급
            <select
              value={classroom}
              onChange={(e) => {
                if (
                  dirty &&
                  !window.confirm(
                    "아직 임시 저장하지 못한 내용이 있어요. 다른 학급으로 이동할까요?",
                  )
                )
                  return;
                setClassroom(e.target.value);
                setValue(initial());
                setDirty(false);
              }}
              disabled={!!edit}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["title", "책 제목", 200],
              ["author", "저자", 200],
              ["publisher", "출판사", 200],
              ["isbn", "ISBN", 40],
            ] as const
          ).map(([key, label, max]) => (
            <label className="field" key={key}>
              {label}
              <input
                name={key}
                value={value[key]}
                onChange={(e) => change(key, e.target.value)}
                required={key === "title"}
                maxLength={max}
              />
            </label>
          ))}
          <label className="field">
            읽은 날짜
            <input
              type="date"
              name="readOn"
              value={value.readOn}
              max={koreanDay()}
              required
              onChange={(e) => change("readOn", e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          독서 상태
          <select
            name="status"
            value={value.status}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="reading">읽는 중</option>
            <option value="completed">완독했어요</option>
          </select>
        </label>
        <GuidedThought
          initial={value.thought}
          value={value.thought}
          onChange={(text) => change("thought", text)}
          memo={JSON.parse(value.guidance)}
          onMemoChange={(memo) => change("guidance", JSON.stringify(memo))}
        />
        <label className="field">
          더 생각해 보고 싶은 질문
          <textarea
            name="question"
            value={value.question}
            onChange={(e) => change("question", e.target.value)}
            maxLength={2000}
            rows={2}
          />
        </label>
        <button
          type="submit"
          className="button button-primary"
          disabled={!!candidate || conflict}
        >
          {busy
            ? "저장 중…"
            : edit
              ? "독서 기록 수정하기"
              : "독서 기록 저장하기"}
        </button>
      </fieldset>
      <label className="hub-check">
        <input
          type="checkbox"
          checked={local}
          onChange={(e) => {
            setLocal(e.target.checked);
            if (!e.target.checked)
              try {
                sessionStorage.removeItem(storageKey);
              } catch {}
          }}
        />
        이 탭에도 미저장 독서 기록 보관
      </label>
      <p className="form-help">
        선택하면 연결이 끊겨도 이 탭에 최대 24시간 보관해요. 공용 기기에서는
        사용 후 로그아웃하세요.
      </p>
      <button className="button button-outline" type="button" onClick={file}>
        현재 독서 글 파일로 보관
      </button>
      {dirty && !conflict && (
        <button
          className="button button-outline"
          type="button"
          onClick={() => setRetry((n) => n + 1)}
        >
          임시 저장 다시 시도
        </button>
      )}
      {conflict && (
        <button
          className="button button-outline"
          type="button"
          onClick={() => {
            if (
              !window.confirm(
                "현재 글을 파일로 보관했나요? 최신 임시 기록을 확인할까요?",
              )
            )
              return;
            setConflict(false);
            setLoaded(false);
            readingDraftAction({
              owner:data.profile.id,
              action: "load",
              classroom,
              record: edit?.id ?? null,
            })
              .then((r) => {
                revision.current = r.draft?.revision ?? 0;
                setCandidate(r.draft?.payload ?? null);
                setLoaded(true);
              })
              .catch(() => setMessage("최신 임시 기록을 읽지 못했어요."));
          }}
        >
          최신 임시 기록 확인
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
