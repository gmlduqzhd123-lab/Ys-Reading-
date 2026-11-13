"use client";
import { useState } from "react";
import type { ClassroomToolState, LibraryBook } from "@/lib/classroom-tools";
import { parseLibraryCsv } from "@/lib/library-csv";
import { useToolAction } from "./use-tool-action";
import { WorkshopListControls } from "./list-controls";
function BookEditor({
  owner,
  classroom,
  book,
  archived,
}: {
  owner: string;
  classroom: string;
  book: LibraryBook & { revision?: number };
  archived: boolean;
}) {
  const action = useToolAction(owner, classroom),
    [title, setTitle] = useState(book.title),
    [author, setAuthor] = useState(book.author),
    [location, setLocation] = useState(book.location),
    [copies, setCopies] = useState(book.copies),
    [confirmed, setConfirmed] = useState(false);
  return (
    <details>
      <summary>이 도서 수정·삭제</summary>
      <form
        data-tool-dirty={
          title !== book.title ||
          author !== book.author ||
          location !== book.location ||
          copies !== book.copies
        }
        onSubmit={async (e) => {
          e.preventDefault();
          await action.run("library_update", {
            isbn: book.isbn,
            title,
            author,
            location,
            copies,
            revision: book.revision ?? 0,
          });
        }}
      >
        <fieldset
          className="hub-fieldset"
          disabled={archived || action.busy || action.blocked}
        >
          <p>ISBN {book.isbn} · 다른 ISBN은 새 도서로 등록해 주세요.</p>
          <label className="field">
            도서 제목 수정
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            도서 저자 수정
            <input
              maxLength={200}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </label>
          <label className="field">
            도서 위치 수정
            <input
              maxLength={80}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label className="field">
            보유 권수 수정
            <input
              type="number"
              min={1}
              max={999}
              required
              value={copies}
              onChange={(e) => setCopies(Number(e.target.value))}
            />
          </label>
          <button className="button button-outline">도서 수정 저장</button>
          <label className="tool-choice">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            이 보유 목록에서 ‘{book.title}’을 삭제합니다. 학생 독서 기록은
            유지됩니다.
          </label>
          <button
            type="button"
            disabled={!confirmed}
            className="button button-outline"
            onClick={() =>
              void action.run("library_delete", {
                isbn: book.isbn,
                revision: book.revision ?? 0,
                confirmed: true,
              })
            }
          >
            확인한 보유 도서 삭제
          </button>
        </fieldset>
      </form>
      <p role="status">{action.message}</p>
    </details>
  );
}
export function ClassLibrary({
  owner,
  state,
  query,
  params = {},
}: {
  owner: string;
  state: ClassroomToolState;
  query: string;
  params?: Record<string, string | undefined>;
}) {
  const action = useToolAction(owner, state.classroom.id),
    [books, setBooks] = useState<LibraryBook[]>([]),
    [error, setError] = useState("");
  function sample() {
    const url = URL.createObjectURL(
        new Blob(
          [
            "\uFEFFISBN,제목,저자,위치,권수\r\n9788936434120,우리 교실 첫 책,책숲,1번 책장,2\r\n",
          ],
          { type: "text/csv;charset=utf-8" },
        ),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "책숲-보유도서-예제.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return (
    <section className="panel" id="library">
      <h2>우리 교실에 있는 책 찾기</h2>
      <p>
        교사가 등록한 보유 목록입니다. 대출 가능 여부·실시간 대출 상태와는
        별도입니다.
      </p>
      {state.lists?.library ? (
        <WorkshopListControls
          classroom={state.classroom.id}
          section="library"
          prefix="book"
          label="보유 도서"
          list={state.lists.library}
          params={params}
        />
      ) : (
        <form action="/classroom">
          <input type="hidden" name="classroom" value={state.classroom.id} />
          <input type="hidden" name="section" value="library" />
          <label className="field">
            보유 도서 제목·저자·ISBN
            <input name="bookQ" defaultValue={query} maxLength={100} />
          </label>
          <button className="button button-outline">교실 도서 검색</button>
        </form>
      )}
      <p>검색 결과 {state.libraryTotal}권</p>
      <div className="tool-grid">
        {state.library.map((b) => (
          <article className="tool-card" key={b.isbn + ":" + b.revision}>
            <h3>{b.title}</h3>
            <p>
              {b.author} · {b.location || "위치 미입력"} · 보유 {b.copies}권
            </p>
            <small>ISBN {b.isbn}</small>
            {state.classroom.owner && b.revision && (
              <BookEditor
                owner={owner}
                classroom={state.classroom.id}
                book={b}
                archived={state.classroom.archived}
              />
            )}
          </article>
        ))}
      </div>
      {state.classroom.owner && (
        <details>
          <summary>교실·학교 보유 도서 CSV 등록</summary>
          <p>
            학생 이름·대출 이력 없이 보유 도서만 등록합니다. ISBN이 같은 항목은
            제목·위치·권수를 갱신합니다. UTF-8 CSV · 100KB 이하 · 한 번에
            100권입니다.
          </p>
          <button className="button button-outline" onClick={sample}>
            보유 도서 CSV 예제 받기
          </button>
          <label className="field">
            보유 도서 CSV 파일
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={
                action.busy || action.blocked || state.classroom.archived
              }
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
            <div data-tool-dirty="true">
              <h3>등록 전 전체 확인 · {books.length}권</h3>
              <p>
                아래 전체 목록을 확인한 뒤 등록하세요. 같은 ISBN의 기존 보유
                정보는 갱신됩니다.
              </p>
              <div
                className="tool-table-scroll"
                tabIndex={0}
                role="region"
                aria-label="CSV 등록 전 전체 도서 목록"
              >
                <table>
                  <thead>
                    <tr>
                      <th>ISBN</th>
                      <th>제목</th>
                      <th>저자</th>
                      <th>위치</th>
                      <th>권수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((b) => (
                      <tr key={b.isbn}>
                        <td>{b.isbn}</td>
                        <td>{b.title}</td>
                        <td>{b.author}</td>
                        <td>{b.location}</td>
                        <td>{b.copies}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              <button
                className="button button-outline"
                onClick={() => setBooks([])}
              >
                등록 미리보기 취소
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <p role="status">{action.message}</p>
        </details>
      )}
    </section>
  );
}
