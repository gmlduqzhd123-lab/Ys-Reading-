"use client";
import { useState } from "react";
import type { ClassroomToolState, LibraryBook } from "@/lib/classroom-tools";
import { parseLibraryCsv } from "@/lib/library-csv";
import { useToolAction } from "./use-tool-action";
export function ClassLibrary({
  owner,
  state,
  query,
}: {
  owner: string;
  state: ClassroomToolState;
  query: string;
}) {
  const action = useToolAction(owner, state.classroom.id),
    [books, setBooks] = useState<LibraryBook[]>([]),
    [error, setError] = useState("");
  return (
    <section className="panel" id="library">
      <h2>우리 교실에 있는 책 찾기</h2>
      <p>
        교사가 등록한 보유 목록입니다. 대출 가능 여부·실시간 대출 상태와는
        별도입니다.
      </p>
      <form action="/classroom" className="hub-inline">
        <input type="hidden" name="classroom" value={state.classroom.id} />
        <label className="field">
          보유 도서 제목·저자·ISBN
          <input name="q" maxLength={100} defaultValue={query} />
        </label>
        <button className="button button-outline">교실 도서 검색</button>
      </form>
      <p>검색 결과 {state.libraryTotal}권 · 한 쪽에 50권</p>
      <div className="tool-grid">
        {state.library.map((b) => (
          <article className="tool-card" key={b.isbn}>
            <h3>{b.title}</h3>
            <p>
              {b.author} · {b.location || "위치 미입력"} · 보유 {b.copies}권
            </p>
            <small>ISBN {b.isbn}</small>
          </article>
        ))}
      </div>
      {state.classroom.owner && (
        <details>
          <summary>교실·학교 보유 도서 CSV 등록</summary>
          <p>
            학생 이름·대출 이력 없이 보유 도서만 등록합니다. 학교 보유 목록도 이
            학급에 제공할 권한이 있는 자료로 준비해 주세요. ISBN이 같은 항목은
            제목·위치·권수를 갱신합니다.
          </p>
          <p>첫 줄: ISBN,제목,저자,위치,권수 · UTF-8 CSV · 한 번에 100권</p>
          <label className="field">
            보유 도서 CSV 파일
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                setError("");
                setBooks([]);
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 100000)
                    throw Error("100KB 이하의 CSV를 선택해 주세요.");
                  setBooks(parseLibraryCsv(await f.text()));
                } catch (x) {
                  setError(
                    x instanceof Error ? x.message : "CSV를 확인해 주세요.",
                  );
                }
              }}
            />
          </label>
          {books.length > 0 && (
            <>
              <p>등록 전 확인 · {books.length}권</p>
              <ul>
                {books.slice(0, 10).map((b) => (
                  <li key={b.isbn}>
                    {b.title} · {b.location} · {b.copies}권
                  </li>
                ))}
              </ul>
              <button
                className="button button-primary"
                disabled={
                  action.busy || action.blocked || state.classroom.archived
                }
                onClick={async () => {
                  if (await action.run("library_import", { books }))
                    setBooks([]);
                }}
              >
                확인한 도서 목록 등록
              </button>
            </>
          )}
          <p role="status">{error || action.message}</p>
        </details>
      )}
    </section>
  );
}
