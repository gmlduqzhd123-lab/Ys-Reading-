"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { bookSchema, koreanDay, type Book } from "@/lib/hub";
import type { HubData, ReadingLog } from "@/lib/hub-data";
import { ClassField, Empty, Field, HubForm, Panel, string } from "./shared";
export function Bookshelf({ data }: { data: HubData }) {
  const [query, setQuery] = useState(""),
    [books, setBooks] = useState<Book[]>([]),
    [message, setMessage] = useState(""),
    [searching, setSearching] = useState(false);
  const [book, setBook] = useState<Book | null>(null),
    [edit, setEdit] = useState<ReadingLog | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const teacher = data.profile.role === "teacher";
  const [filter, setFilter] = useState("");
  async function search() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setSearching(true);
    setMessage("");
    try {
      const r = await fetch(`/api/books?q=${encodeURIComponent(query)}`, {
        signal: request.signal,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "검색하지 못했어요.");
      const valid = (json.books ?? []).flatMap((b: unknown) => {
        const p = bookSchema.safeParse(b);
        return p.success ? [p.data] : [];
      });
      setBooks(valid);
      setMessage(
        valid.length
          ? `${json.source ?? "도서"} 검색 결과입니다. 원하는 판본인지 책 정보를 확인해 주세요.`
          : "검색 결과가 없어요. 아래에서 책 정보를 직접 입력할 수 있습니다.",
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
      {!teacher && (
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
          <div className="book-results">
            {books.map((b, i) => (
              <button
                type="button"
                className="book-result"
                key={`${b.isbn}-${i}`}
                onClick={() => {
                  setBook(b);
                  setEdit(null);
                  setBooks([]);
                }}
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
                    {b.author} · {b.publisher}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <HubForm
            key={`${edit ? `${edit.id}:${edit.revision}` : JSON.stringify(book)}:${formVersion}`}
            command="reading_save"
            disabled={
              !data.classes.length || data.profile.consent_status !== "verified"
            }
            label={edit ? "독서 기록 수정하기" : "독서 기록 저장하기"}
            onSuccess={() => {
              setEdit(null);
              setBook(null);
              setFormVersion((v) => v + 1);
              setMessage(
                "독서 기록을 저장했어요. 아래 내 기록에서 확인할 수 있습니다.",
              );
            }}
            payload={(f) => ({
              ...(edit ? { id: edit.id, revision: edit.revision } : {}),
              classroomId: string(f, "classroomId"),
              book: {
                title: string(f, "title"),
                author: string(f, "author"),
                publisher: string(f, "publisher"),
                isbn: string(f, "isbn"),
                thumbnail: book?.thumbnail ?? edit?.book.thumbnail ?? "",
              },
              readOn: string(f, "readOn"),
              status: string(f, "status"),
              thought: string(f, "thought"),
              question: string(f, "question"),
            })}
          >
            <div className="hub-form-grid">
              <ClassField classes={data.classes} />
              <Field
                name="title"
                label="책 제목"
                defaultValue={book?.title ?? edit?.book.title ?? ""}
                maxLength={200}
              />
              <Field
                name="author"
                label="저자"
                required={false}
                defaultValue={book?.author ?? edit?.book.author ?? ""}
                maxLength={200}
              />
              <Field
                name="publisher"
                label="출판사"
                required={false}
                defaultValue={book?.publisher ?? edit?.book.publisher ?? ""}
                maxLength={200}
              />
              <Field
                name="isbn"
                label="ISBN"
                required={false}
                defaultValue={book?.isbn ?? edit?.book.isbn ?? ""}
                maxLength={40}
              />
              <Field
                name="readOn"
                label="읽은 날짜"
                type="date"
                defaultValue={edit?.read_on ?? koreanDay()}
                max={koreanDay()}
              />
            </div>
            <label className="field">
              독서 상태
              <select name="status" defaultValue={edit?.status ?? "reading"}>
                <option value="reading">읽는 중</option>
                <option value="completed">완독했어요</option>
              </select>
            </label>
            <label className="field">
              기억에 남는 장면과 나의 생각
              <textarea
                name="thought"
                defaultValue={edit?.thought ?? ""}
                required
                maxLength={10000}
                rows={6}
              />
            </label>
            <label className="field">
              더 생각해 보고 싶은 질문
              <textarea
                name="question"
                defaultValue={edit?.question ?? ""}
                maxLength={2000}
                rows={2}
              />
            </label>
            <p className="form-help">
              기록 저장과 보상 지급은 별개예요. 완독 기록을 선생님이 확인하면
              경험치와 학급 화폐가 지급됩니다. 확인한 기록은 보존돼요.
            </p>
          </HubForm>
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
            <article className="hub-record" key={l.id}>
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
              {teacher && l.status === "completed" && !l.verified_at && (
                <HubForm
                  command="reading_verify"
                  payload={() => ({ id: l.id })}
                  label="완독 기록 확인·보상 지급"
                />
              )}
              {!teacher && !l.verified_at && (
                <button
                  className="button button-outline"
                  onClick={() => {
                    setEdit(l);
                    setBook(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
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
