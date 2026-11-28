"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Book } from "@/lib/hub";
import type { ClassroomToolState } from "@/lib/classroom-tools";
import { useToolAction } from "./use-tool-action";

import { useWorkshopDraft, WorkshopDraftNotice } from "./work-draft";
import { workshopDraftPayloads } from "@/lib/workshop-operations";
import { hubHref } from "@/lib/hub-navigation";
import { z } from "zod";

export function QuickReadingClassChoice({ classes, tab }: {
  classes: { id: string; name: string }[];
  tab: "today" | "reading";
}) {
  return (
    <section className="panel quick-reading" aria-labelledby="quick-reading-class-title">
      <h2 id="quick-reading-class-title">오늘 읽고, 한 줄 남기기</h2>
      <form action="/hub" className="hub-inline">
        <input type="hidden" name="tab" value={tab} />
        <label className="field">
          간편 독서 기록을 남길 학급
          <select name="classroom" defaultValue="" required>
            <option value="">학급을 선택해 주세요</option>
            {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button className="button button-primary">이 학급의 독서 기록 열기</button>
      </form>
    </section>
  );
}
export function QuickReading({
  owner,
  state,
}: {
  owner: string;
  state: ClassroomToolState;
}) {
  const action = useToolAction(owner, state.classroom.id),
    [step, setStep] = useState(1),
    [book, setBook] = useState<Book>(
      state.books[0] ?? {
        title: "",
        author: "",
        publisher: "",
        isbn: "",
        thumbnail: "",
      },
    ),
    [thought, setThought] = useState(""),
    [excerpt, setExcerpt] = useState(""),
    [saved, setSaved] = useState(false);
  const draft = useWorkshopDraft({
    owner,
    scope: "quick",
    context: { classroom: state.classroom.id },
    payload: { book, thought, excerpt, step },
    enabled: !saved,
    apply: (p) => {
      if (!Object.keys(p).length) {
        setThought("");
        setExcerpt("");
        setStep(1);
        return;
      }
      const v = workshopDraftPayloads.quick.parse(p);
      setBook(v.book);
      setThought(v.thought);
      setExcerpt(v.excerpt);
      setStep(v.step);
      setSaved(false);
    },
  });
  const [recordId, setRecordId] = useState<string>();
  const recordHref = (edit = false) => hubHref("reading", state.classroom.id,
    recordId ? { record: recordId, ...(edit ? { edit: 1 } : {}) } : {});
  useEffect(() => {
    if (action.blocked) {
      setRecordId(undefined);
      setSaved(false);
      setThought("");
      setExcerpt("");
      setBook({
        title: "",
        author: "",
        publisher: "",
        isbn: "",
        thumbnail: "",
      });
    }
  }, [action.blocked]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!saved && (thought || excerpt)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [thought, excerpt, saved]);
  if (state.classroom.archived) return null;
  return (
    <section className="panel quick-reading" aria-label="오늘의 간편 독서 기록">
      <span className="eyebrow">ONE SENTENCE TODAY</span>
      <h2>오늘 읽고, 한 줄 남기기</h2>
      <p>
        {state.classroom.name} ·{" "}
        {step === 1 ? "1. 읽은 책 고르기" : "2. 오늘의 구절과 생각"}
      </p>
      <WorkshopDraftNotice draft={draft} />
      <form
        data-tool-dirty={!saved && (!!thought || !!excerpt)}
        data-hub-dirty={!saved && (!!thought || !!excerpt)}
        onSubmit={async (e) => {
          e.preventDefault();
          if (step === 1) {
            setStep(2);
            return;
          }
          const result = await action.run("daily_read", {
            book,
            thought,
            excerpt,
          });
          if (result) {
            await draft.clear().catch(() => {});
            const id = z.uuid().safeParse(result.id);
            if (id.success) setRecordId(id.data);
            setSaved(true);
            setThought("");
            setExcerpt("");
          }
        }}
      >
        <fieldset
          disabled={
            action.busy ||
            action.blocked ||
            draft.blocked ||
            !draft.ready ||
            saved
          }
          className="hub-fieldset"
        >
          {step === 1 ? (
            <>
              <label className="field">
                읽던 책
                <select
                  aria-label="최근 읽던 책"
                  value={state.books.findIndex(
                    (b) => b.title === book.title && b.author === book.author,
                  )}
                  onChange={(e) =>
                    setBook(
                      state.books[Number(e.target.value)] ?? {
                        title: "",
                        author: "",
                        publisher: "",
                        isbn: "",
                        thumbnail: "",
                      },
                    )
                  }
                >
                  <option value={-1}>새 책 직접 입력</option>
                  {state.books.map((b, i) => (
                    <option key={i} value={i}>
                      {b.title}
                      {b.author ? " · " + b.author : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                오늘 읽은 책 제목
                <input
                  required
                  maxLength={200}
                  value={book.title}
                  onChange={(e) =>
                    setBook({
                      ...book,
                      title: e.target.value,
                      isbn: "",
                      thumbnail: "",
                    })
                  }
                />
              </label>
              <details>
                <summary>저자 등 책 정보</summary>
                <label className="field">
                  간편 기록 저자
                  <input
                    maxLength={200}
                    value={book.author}
                    onChange={(e) =>
                      setBook({ ...book, author: e.target.value })
                    }
                  />
                </label>
                <p>
                  책 검색은 나의 책장, 교실 보유 도서는 아래 도서 찾기에서
                  이용할 수 있어요.
                </p>
              </details>
              <button className="button button-primary">
                이 책으로 오늘 기록하기
              </button>
            </>
          ) : (
            <>
              <strong>{book.title}</strong>
              {state.mode !== "thought" && (
                <label className="field">
                  기억에 남는 구절
                  <textarea
                    aria-label="기억에 남는 구절"
                    required
                    maxLength={1000}
                    value={excerpt}
                    onChange={(e) => {
                      setExcerpt(e.target.value);
                      setSaved(false);
                    }}
                  />
                </label>
              )}
              {state.mode !== "quote" && (
                <label className="field">
                  오늘의 한 줄 생각
                  <textarea
                    aria-label="오늘의 한 줄 생각"
                    required
                    maxLength={1000}
                    value={thought}
                    onChange={(e) => {
                      setThought(e.target.value);
                      setSaved(false);
                    }}
                  />
                </label>
              )}
              <div className="button-row">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setStep(1)}
                >
                  책 다시 고르기
                </button>
                <button className="button button-primary">
                  오늘 독서 기록 저장
                </button>
              </div>
            </>
          )}
        </fieldset>
      </form>
      <p role="status">
        {saved
          ? "독서 기록을 저장했어요. 완독·보상은 선생님의 별도 확인으로 이어집니다."
          : action.message}
      </p>
      {saved && (
        <div className="button-row">
          <Link className="button button-outline" href={recordHref()}>
            {recordId ? "방금 쓴 기록 보기" : "나의 책장에서 기록 확인"}
          </Link>
          {recordId && <Link className="button button-primary" href={recordHref(true)}>이 기록에 더 쓰기</Link>}
        </div>
      )}
    </section>
  );
}
