"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { koreanDay, readingScrollBehavior, type Book } from "@/lib/hub";
import type { HubData, ReadingLog } from "@/lib/hub-data";
import { ClassField, Empty, Field, HubForm, Panel, string } from "./shared";
import { PaperBook } from "@/components/paper-book";
import { Plus, ArrowDownRight, ArrowRight, PenLine } from "lucide-react";
import { ReadingEditor } from "./reading-editor";
import { SaveStatus } from "@/components/save-status";
import { hubHref, withClassroom } from "@/lib/hub-navigation";
import { RecordBookSearch } from "./record-book-search";

export function LinkedReadingRecord({ data, id, initiallyEditing }: {
  data: HubData;
  id: string;
  initiallyEditing?: boolean;
}) {
  const record = data.logs.find(item => item.id === id && item.student_id === data.profile.id);
  const classroom = data.classes.find(item => item.id === record?.classroom_id);
  const editable = !!record && !!classroom && classroom.term_state !== "archived" && !record.verified_at;
  const [editing, setEditing] = useState(Boolean(initiallyEditing && editable));
  const [saved, setSaved] = useState(false);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const showEditor = editable && editing;
  useEffect(() => {
    if (showEditor) editorHeading.current?.focus();
  }, [showEditor]);
  return (
    <section className="panel linked-reading" aria-labelledby="linked-reading-title">
      <Link className="text-link" href={hubHref("reading", data.selectedClassroom)}>나의 책장으로 돌아가기</Link>
      <h2 id="linked-reading-title">{record?.book.title ?? "독서 기록을 확인해 주세요"}</h2>
      {record ? (
        <>
          <p className="form-help">{[classroom?.name, record.read_on, record.book.author].filter(Boolean).join(" · ")}</p>
          {saved && <p role="status"><SaveStatus kind="reading" /> 같은 기록에 반영했어요.</p>}
          {showEditor ? (
            <div>
              <h3 ref={editorHeading} tabIndex={-1}>이 독서 기록에 더 쓰기</h3>
              <p className="form-help">기억에 남는 구절이나 새로 든 생각을 덧붙여 보세요.</p>
              <ReadingEditor key={record.id + ":" + record.revision} data={data} book={null} edit={record}
                onEdit={() => setSaved(false)} onSaved={() => { setSaved(true); setEditing(false); }} />
            </div>
          ) : (
            <>
              <p className="submission-body">{record.thought}</p>
              {record.question && <p>나의 질문 · {record.question}</p>}
              {editable && <button type="button" className="button button-primary" onClick={() => {
                setSaved(false);
                setEditing(true);
              }}>이 기록에 더 쓰기</button>}
            </>
          )}
        </>
      ) : <p>이 학급에서 열 수 있는 내 독서 기록인지 확인해 주세요.</p>}
    </section>
  );
}
export function Bookshelf({ data }: { data: HubData }) {
  const [book, setBook] = useState<Book | null>(null),
    [edit, setEdit] = useState<ReadingLog | null>(null);
  const activeClasses = data.classes.filter(c => c.term_state !== "archived");
  const [bookClassroom, setBookClassroom] = useState<string>();
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
  const compose = () => {
    if (editor.current) { editor.current.open = true; editor.current.scrollIntoView({ behavior: readingScrollBehavior(), block: "start" }); }
  };
  function chooseBook(value: Book | null, classroom: string) {
    if (document.querySelector('form[data-reading-editor="true"][data-hub-dirty="true"]')
      && !window.confirm("아직 임시 저장하지 못한 독서 기록이 있어요. 책 선택을 바꿀까요?")) return false;
    setBook(value);
    setBookClassroom(classroom || undefined);
    setEdit(null);
    setRecordSaved(false);
    setFormVersion(v => v + 1);
    requestAnimationFrame(() => editor.current?.querySelector<HTMLInputElement>('form[data-reading-editor="true"] input[name="title"]')?.focus());
    return true;
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
          <RecordBookSearch classes={activeClasses} choose={chooseBook} />
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
