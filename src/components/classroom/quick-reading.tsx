"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Book } from "@/lib/hub";
import type { ClassroomToolState } from "@/lib/classroom-tools";
import { useToolAction } from "./use-tool-action";
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
  useEffect(() => {
    if (action.blocked) {
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
            setSaved(true);
            setThought("");
            setExcerpt("");
          }
        }}
      >
        <fieldset
          disabled={action.busy || action.blocked || saved}
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
        <Link
          className="button button-outline"
          href={"/hub?tab=reading&classroom=" + state.classroom.id}
        >
          나의 책장에서 기록 확인
        </Link>
      )}
    </section>
  );
}
