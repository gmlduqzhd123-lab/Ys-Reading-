"use client";

import { useEffect, useRef, useState } from "react";
import { bookSchema, type Book } from "@/lib/hub";

type HeldBook = Book & { location: string };
type Search = { q: string; classroom: string; request: AbortController };
const key = (isbn: string) => isbn.replaceAll("-", "");

async function fetchBooks(params: Record<string, string>, signal: AbortSignal) {
  const response = await fetch("/api/books?" + new URLSearchParams(params), { signal });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? "도서 검색을 마치지 못했어요.");
  return data;
}

export function RecordBookSearch({ classes, choose }: {
  classes: { id: string; name: string }[];
  choose: (book: Book | null, classroom: string) => boolean;
}) {
  const [classroom, setClassroom] = useState(classes[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [library, setLibrary] = useState<HeldBook[]>([]);
  const [page, setPage] = useState({ current: 0, total: 0, hasNext: false });
  const [libraryPending, setLibraryPending] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [external, setExternal] = useState<Book[]>([]);
  const [externalPending, setExternalPending] = useState(false);
  const [externalError, setExternalError] = useState("");
  const current = useRef<Search | null>(null);
  useEffect(() => () => current.current?.request.abort(), []);

  function reset() {
    current.current?.request.abort();
    current.current = null;
    setSubmitted(false);
    setLibrary([]);
    setPage({ current: 0, total: 0, hasNext: false });
    setLibraryPending(false);
    setLibraryError("");
    setExternal([]);
    setExternalPending(false);
    setExternalError("");
  }

  async function readLibrary(search: Search, next: number) {
    const signal = search.request.signal;
    setLibraryPending(true);
    setLibraryError("");
    try {
      const payload = await fetchBooks({
        source: "library", q: search.q, classroom: search.classroom, page: String(next),
      }, signal);
      if (signal.aborted) return;
      const books = (payload.library ?? []).flatMap((value: unknown) => {
        const book = bookSchema.safeParse(value);
        if (!book.success) return [];
        const location = (value as { location?: unknown }).location;
        return [{ ...book.data, location: typeof location === "string" ? location : "" }];
      }) as HeldBook[];
      setLibrary(existing => [...new Map([...existing, ...books].map(book => [key(book.isbn), book])).values()]);
      setPage({ current: next, total: payload.libraryTotal, hasNext: payload.hasNext === true });
    } catch (error) {
      if (!signal.aborted) setLibraryError(error instanceof Error ? error.message : "보유 도서를 읽지 못했어요.");
    } finally {
      if (!signal.aborted) setLibraryPending(false);
    }
  }

  async function readExternal(search: Search) {
    const signal = search.request.signal;
    setExternalPending(true);
    setExternalError("");
    try {
      const payload = await fetchBooks({ source: "external", q: search.q }, signal);
      if (!signal.aborted) setExternal((payload.books ?? []).flatMap((value: unknown) => {
        const book = bookSchema.safeParse(value);
        return book.success ? [book.data] : [];
      }));
    } catch (error) {
      if (!signal.aborted) setExternalError(error instanceof Error ? error.message : "외부 도서를 읽지 못했어요.");
    } finally {
      if (!signal.aborted) setExternalPending(false);
    }
  }

  function search() {
    const q = query.trim();
    if (q.length < 2 || q.length > 100) return;
    reset();
    const lookup = { q, classroom, request: new AbortController() };
    current.current = lookup;
    setSubmitted(true);
    if (classroom) void readLibrary(lookup, 1);
    void readExternal(lookup);
  }

  const heldCodes = new Set(library.map(book => key(book.isbn)));
  const outside = external.filter(book => !book.isbn || !heldCodes.has(key(book.isbn)));
  function pick(book: Book | null) {
    if (choose(book, classroom)) reset();
  }

  return <>
    <form className="hub-search" onSubmit={event => { event.preventDefault(); search(); }}>
      {classes.length > 1 && <label className="field">
        보유 도서를 찾을 학급
        <select value={classroom} onChange={event => { reset(); setClassroom(event.target.value); }}>
          {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      <label className="field">
        제목·저자·ISBN
        <input value={query} onChange={event => setQuery(event.target.value)} minLength={2} maxLength={100} required />
      </label>
      <button className="button button-outline">도서 검색</button>
    </form>
    {submitted && classroom && <section aria-label="교실 보유 도서">
      <h3>교실 보유 도서</h3>
      {!!page.total && <p className="form-help">{library.length}권 표시 · 전체 {page.total}권</p>}
      <div className="book-results">
        {library.map(book => <button type="button" className="book-result" key={book.isbn} onClick={() => pick(book)}>
          <span><strong>{book.title}</strong><small>{[book.author, book.location, book.isbn].filter(Boolean).join(" · ")}</small></span>
        </button>)}
      </div>
      {libraryPending && <p role="status">교실 보유 도서를 찾고 있어요.</p>}
      {libraryError && <p role="status">{libraryError}</p>}
      {!libraryPending && !libraryError && !library.length && <p>교실 보유 도서에서 찾지 못했어요.</p>}
      {(page.hasNext || libraryError) && <button type="button" className="button button-outline" disabled={libraryPending}
        onClick={() => { if (current.current) void readLibrary(current.current, page.current + 1); }}>
        {libraryError ? "보유 도서 다시 찾기" : "보유 도서 더 보기"}
      </button>}
    </section>}
    {submitted && <section aria-label="외부 검색 결과">
      <h3>외부 검색 결과</h3>
      {externalPending && <p role="status">외부 도서를 찾고 있어요.</p>}
      {externalError && <p role="status">{externalError}</p>}
      {!externalPending && !externalError && !outside.length && <p>추가 외부 검색 결과가 없어요.</p>}
      <div className="book-results">
        {outside.map((book, index) => <button type="button" className="book-result" key={book.isbn + ":" + index} onClick={() => pick(book)}>
          {book.thumbnail && <img src={book.thumbnail} alt="" width={45} height={65} referrerPolicy="no-referrer" />}
          <span><strong>{book.title}</strong><small>{[book.author, book.publisher, book.isbn].filter(Boolean).join(" · ")}</small></span>
        </button>)}
      </div>
    </section>}
    <button type="button" className="button button-outline" onClick={() => pick(null)}>책 정보를 직접 입력</button>
  </>;
}
