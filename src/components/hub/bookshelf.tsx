"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { bookSchema, koreanDay, readingScrollBehavior, type Book } from "@/lib/hub";
import type { HubData, ReadingLog } from "@/lib/hub-data";
import { ClassField, Empty, Field, HubForm, Panel, string } from "./shared";
import { PaperBook } from "@/components/paper-book";
import { Plus, ArrowDownRight, ArrowRight, PenLine } from "lucide-react";
import { ReadingEditor } from "./reading-editor";
import { SaveStatus } from "@/components/save-status";
import { withClassroom } from "@/lib/hub-navigation";
type HeldBook = Book & { location: string };
export function Bookshelf({ data }: { data: HubData }) {
  const [query, setQuery] = useState(""),
    [books, setBooks] = useState<Book[]>([]),
    [library, setLibrary] = useState<HeldBook[]>([]),
    [message, setMessage] = useState(""),
    [searching, setSearching] = useState(false);
  const [book, setBook] = useState<Book | null>(null),
    [edit, setEdit] = useState<ReadingLog | null>(null);
  const activeClasses = data.classes.filter(c => c.term_state !== "archived");
  const [searchClass, setSearchClass] = useState(activeClasses[0]?.id ?? "");
  const [bookClassroom, setBookClassroom] = useState<string>();
  const controller = useRef<AbortController | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [recordSaved, setRecordSaved] = useState(false);
  const teacher = data.profile.role === "teacher";
  const [filter, setFilter] = useState("");
  const ownSubmissions = data.submissions.filter((s) => s.student_id === data.profile.id);
  const currentDraft = data.drafts.filter((d) => d.student_id === data.profile.id && (d.title.trim() || d.body.trim()) &&
    !ownSubmissions.some((s) => s.assignment_id === d.assignment_id && Date.parse(s.created_at) >= Date.parse(d.updated_at) && s.status !== "revision_requested"))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
  const recentWork = currentDraft ?? ownSubmissions.toSorted((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const editor = useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(location.hash==="#reading-editor"&&editor.current)editor.current.open=true;},[]);
  useEffect(() => () => controller.current?.abort(), []);
  const compose = () => {
    if (editor.current) { editor.current.open = true; editor.current.scrollIntoView({ behavior: readingScrollBehavior(), block: "start" }); }
  };
  function chooseBook(value: Book | null) {
    if (document.querySelector('form[data-reading-editor="true"][data-hub-dirty="true"]')
      && !window.confirm("아직 임시 저장하지 못한 독서 기록이 있어요. 책 선택을 바꿀까요?")) return;
    setBook(value);
    setBookClassroom(searchClass || undefined);
    setEdit(null);
    setRecordSaved(false);
    setBooks([]);
    setLibrary([]);
    setMessage("");
    setFormVersion(v => v + 1);
    requestAnimationFrame(() => editor.current?.querySelector<HTMLInputElement>('form[data-reading-editor="true"] input[name="title"]')?.focus());
  }
  async function search() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setSearching(true);
    setMessage("");
    setBooks([]);
    setLibrary([]);
    try {
      const params = new URLSearchParams({ q: query, classroom: searchClass });
      const r = await fetch("/api/books?" + params, {
        signal: request.signal,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "검색하지 못했어요.");
      if (request.signal.aborted) return;
      const valid = (json.books ?? []).flatMap((b: unknown) => {
        const p = bookSchema.safeParse(b);
        return p.success ? [p.data] : [];
      });
      setBooks(valid);
      const held = (json.library ?? []).flatMap((b: unknown) => {
        if (!b || typeof b !== "object") return [];
        const raw = b as { title: string; author: string; isbn: string; location?: string };
        const parsed = bookSchema.safeParse({ ...raw, publisher: "", thumbnail: "" });
        return parsed.success ? [{ ...parsed.data, location: raw.location ?? "" }] : [];
      }) as HeldBook[];
      setLibrary(held);
      setMessage(
        [
          searchClass ? `교실 보유 도서 ${held.length}권${json.libraryTotal > held.length ? ` 표시 · 전체 ${json.libraryTotal}권` : ""}` : "",
          json.externalMessage || (valid.length ? `외부 검색 ${valid.length}권` : "외부 검색 결과가 없어요."),
          !held.length && !valid.length ? "아래에서 직접 입력할 수 있어요." : "",
        ].filter(Boolean).join(" · "),
      );
    } catch (e) {
      if (!request.signal.aborted)
        setMessage(e instanceof Error ? e.message : "도서 검색에 실패했어요.");
    } finally {
      if (!request.signal.aborted) setSearching(false);
    }
  }
  return (
    <>
      <section className="paper-reading-gallery" aria-label={teacher ? "우리 교실의 책장" : "나의 책장"}>
        <div className="paper-section-heading"><h2>{teacher ? "우리 교실의 책장" : "나의 책장"}</h2><span>최근 독서 기록</span></div>
        {data.logs.length > 0 ? <div className="paper-book-grid">
          {data.logs.slice(0, 3).map((l, i) => <a key={l.id} href={`#reading-${l.id}`} className="paper-book-link">
            <PaperBook key={l.book.thumbnail} title={l.book.title} author={l.book.author} thumbnail={l.book.thumbnail} tone={i} />
            <h3>{l.book.title}</h3><p>{l.book.author || "저자 미입력"}</p><span className={`status-pill ${l.verified_at ? "completed" : ""}`}>{l.verified_at ? "확인 완료" : l.status === "completed" ? "완독 · 확인 대기" : "읽는 중"}</span>
          </a>)}
        </div> : <div className="paper-empty-shelf"><span aria-hidden="true"><Plus size={28} strokeWidth={1} /></span><h3>한 권에서 시작하는 나의 이야기</h3><p>{teacher ? "학생이 기록을 남기면 이곳에 우리 교실의 책장이 채워집니다." : "읽은 책과 떠오른 생각을 남겨 보세요. 나만의 책장이 천천히 채워집니다."}</p></div>}
        {!teacher && <button className="paper-new-record" onClick={compose}><Plus size={18} />새 독서 기록 남기기 <ArrowDownRight size={16} /></button>}
      </section>
      {!teacher && <section className="paper-writing-preview">
        <div><span className="eyebrow">A SENTENCE OF MY OWN</span><h2>{currentDraft ? "쓰고 있는 이야기" : "나의 글 한 편"}</h2>
          <h3>{recentWork?.title || "한 문장에서 시작해 볼까요?"}</h3><p>{recentWork?.body || "배정받은 독서미션에서 나의 생각을 글로 남겨 보세요."}</p>
          <Link href={withClassroom(recentWork ? `/app/work/${recentWork.assignment_id}` : "/app?view=missions", data.selectedClassroom)} className="paper-text-link">{currentDraft ? "이어서 쓰기" : recentWork ? "작품·피드백 보기" : "독서미션 시작하기"}<ArrowRight size={15} /></Link></div>
        <PenLine size={52} strokeWidth={.65} aria-hidden="true" />
      </section>}
      {!teacher && (
        <details ref={editor} id="reading-editor" className="paper-record-editor">
          <summary>독서 기록 쓰기·수정하기 <Plus size={18} /></summary>
        <Panel title="어떤 책을 읽었나요?">
          <p>
            책을 검색해 선택하거나 직접 입력하세요. 한 권에 여러 날의 생각을
            기록할 수 있어요.
          </p>
          <form
            className="hub-search"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            {activeClasses.length > 1 && (
              <label className="field">
                보유 도서를 찾을 학급
                <select value={searchClass} disabled={searching} onChange={e => {
                  setSearchClass(e.target.value);
                  setLibrary([]);
                  setBooks([]);
                  setMessage("");
                }}>
                  {activeClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              제목·저자·ISBN
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                minLength={2}
                maxLength={100}
                required
              />
            </label>
            <button className="button button-outline" disabled={searching}>
              {searching ? "검색 중…" : "도서 검색"}
            </button>
          </form>
          {message && <p role="status">{message}</p>}
          {!!library.length && (
            <section aria-label="교실 보유 도서">
              <h3>교실 보유 도서</h3>
              <div className="book-results">
                {library.map(b => (
                  <button type="button" className="book-result" key={b.isbn} onClick={() => chooseBook(b)}>
                    <span><strong>{b.title}</strong><small>{[b.author, b.location, b.isbn].filter(Boolean).join(" · ")}</small></span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {!!books.length && <h3>외부 검색 결과</h3>}
          <div className="book-results">
            {books.map((b, i) => (
              <button
                type="button"
                className="book-result"
                key={`${b.isbn}-${i}`}
                onClick={() => chooseBook(b)}
              >
                {b.thumbnail && (
                  <img
                    src={b.thumbnail}
                    alt=""
                    width={45}
                    height={65}
                    referrerPolicy="no-referrer"
                  />
                )}
                <span>
                  <strong>{b.title}</strong>
                  <small>
                    {b.author} · {b.publisher}{b.isbn&&` · ISBN ${b.isbn}`}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="button button-outline" onClick={() => chooseBook(null)}>책 정보를 직접 입력</button>
          {recordSaved && <div className="save-status-region" role="status">
            <SaveStatus kind="reading" />
            <p>독서 기록을 저장했어요. 아래 내 기록에서 확인할 수 있습니다.</p>
          </div>}
          <ReadingEditor key={`${edit ? `${edit.id}:${edit.revision}` : JSON.stringify(book)}:${formVersion}`} data={data} book={book} edit={edit} bookClassroom={bookClassroom}
            onEdit={() => setRecordSaved(false)}
            onSaved={() => {
              setEdit(null);
              setBook(null);
              setFormVersion(v => v + 1);
              setRecordSaved(true);
            }} />

          {!data.classes.length && (
            <p className="notice">아래 학급 연결 신청을 먼저 진행해 주세요.</p>
          )}
          {edit && (
            <button
              className="button button-outline"
              onClick={() => setEdit(null)}
            >
              수정 닫기 · 새 기록 작성
            </button>
          )}
        </Panel>
        </details>
      )}
      <Panel title={teacher ? "우리 반 독서 기록 확인" : "나의 독서 기록"}>
        <label className="field">
          책·작성자 검색
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="제목이나 학생 이름"
          />
        </label>
        {!data.logs.length && (
          <Empty>아직 독서 기록이 없어요. 책 한 권에서 시작해 보세요.</Empty>
        )}
        {data.logs
          .filter((l) =>
            `${l.book.title} ${l.book.author} ${data.students.find((p) => p.id === l.student_id)?.display_name ?? ""}`.includes(
              filter,
            ),
          )
          .map((l) => (
            <article className="hub-record" id={`reading-${l.id}`} key={l.id}>
              <div className="hub-row">
                <h3>{l.book.title}</h3>
                <span className="status-pill">
                  {l.verified_at
                    ? "선생님 확인 완료"
                    : l.status === "completed"
                      ? "완독 · 확인 대기"
                      : "읽는 중"}
                </span>
              </div>
              <small>
                {l.book.author} · {l.read_on}
                {teacher
                  ? ` · ${data.students.find((p) => p.id === l.student_id)?.display_name ?? "학생"}`
                  : ""}
              </small>
              <p className="submission-body">{l.thought}</p>
              {l.question && <p>나의 질문: {l.question}</p>}
              {data.classes.find(c=>c.id===l.classroom_id)?.term_state==="archived"&&<p className="form-help">보관된 학기 · 조회·내보내기 가능</p>}
              {teacher && l.status === "completed" && !l.verified_at && data.classes.find(c=>c.id===l.classroom_id)?.term_state!=="archived" && (
                <HubForm
                  command="reading_verify"
                  payload={() => ({ id: l.id })}
                  label="완독 기록 확인·보상 지급"
                />
              )}
              {!teacher && !l.verified_at && data.classes.find(c=>c.id===l.classroom_id)?.term_state!=="archived" && (
                <button
                  className="button button-outline"
                  onClick={() => {
                    setEdit(l);
                    setBook(null);
                    compose();
                  }}
                >
                  기록 수정
                </button>
              )}
              {!teacher && (
                <Link className="button button-outline" href="/missions">
                  이 책으로 독서미션 찾기
                </Link>
              )}
            </article>
          ))}
      </Panel>
    </>
  );
}
