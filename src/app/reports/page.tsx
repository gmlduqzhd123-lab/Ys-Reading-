import Link from "next/link";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadOperationsWorkspace } from "@/lib/operations-workspace";
import {
  ReportComposer,
  ReportArchive,
  ReportBatch,
} from "@/components/growth-reports";
import type { GrowthReport, ReportState } from "@/lib/growth-report";
import type { CollaborationState } from "@/lib/collaboration";
export const metadata = { title: "학기 성장 보고서" };
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await requireProfile(),
    params = await searchParams,
    c = await createClient(),
    teacher = p.role === "teacher";
  const staff = teacher
    ? await c.rpc("collaboration_state", { p_classroom: null, p_page: 1 })
    : null;
  const ownedClasses = staff?.data
    ? (staff.data as CollaborationState).classes.filter((x) => x.read)
    : [];
  const ownedSelected =
    ownedClasses.find((x) => x.id === params.classroom)?.id ??
    ownedClasses[0]?.id;
  const staffClass = ownedClasses.find((x) => x.id === ownedSelected),
    studentPage = Math.max(
      1,
      Math.min(100000, Number(params.studentPage) || 1),
    );
  const delegated =
    staffClass && !staffClass.owner
      ? await c.rpc("collaboration_state", {
          p_classroom: ownedSelected,
          p_page: studentPage,
        })
      : null;
  const delegatedData = delegated?.data as CollaborationState | null;
  const studentsPerPage = delegatedData ? 30 : 50;
  const workspace = delegatedData
      ? {
          selected: ownedSelected,
          students: delegatedData.students,
          totals: { students: delegatedData.total },
          pages: { q: "", studentPage },
        }
      : teacher && ownedSelected
        ? await loadOperationsWorkspace(ownedSelected, params)
        : null,
    cls = workspace?.selected ?? null,
    student = z.uuid().safeParse(params.student).success
      ? params.student
      : null,
    page = Math.max(1, Math.min(100000, Math.trunc(Number(params.page)) || 1)),
    worksPage = Math.max(
      1,
      Math.min(100000, Math.trunc(Number(params.worksPage)) || 1),
    );
  const from = params.from || null,
    until = params.until || null,
    datesValid =
      (!from && !until) ||
      (z.iso.date().safeParse(from).success &&
        z.iso.date().safeParse(until).success &&
        from! <= until! &&
        (Date.parse(until!) - Date.parse(from!)) / 86400000 <= 1096);
  let state: ReportState | null = null;
  if (teacher && cls && student && datesValid) {
    const r = await c.rpc("growth_report_state", {
      p_classroom: cls,
      p_student: student,
      p_from: from,
      p_until: until,
      p_page: worksPage,
    });
    if (r.error)
      throw Error(
        "보고서를 준비하지 못했어요. 담당 학급·학생·기간을 확인해 주세요.",
      );
    state = r.data;
  }
  let query = c
    .from("term_reports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 10, page * 10 - 1);
  if (teacher) {
    if (cls) query = query.eq("classroom_id", cls);
    if (student) query = query.eq("student_id", student);
  } else query = query.eq("student_id", p.id);
  const reports = await query;
  if (reports.error)
    throw Error("보고서를 읽지 못했어요. 연결을 확인해 주세요.");
  function href(changes: Record<string, string>) {
    const q = new URLSearchParams(
      Object.entries(params).filter(
        (e): e is [string, string] => e[1] !== undefined,
      ),
    );
    for (const [k, v] of Object.entries(changes)) q.set(k, v);
    return "/reports?" + q;
  }
  return (
    <div className="operations-page">
      <span className="eyebrow">GROWTH RECORD</span>
      <h1>학기 성장 보고서</h1>
      <p>
        활동 기록과 대표 작품을 모으고 선생님이 직접 확인한 관찰 의견을
        남깁니다. 학생 간 순위나 성적을 자동으로 매기지 않습니다.
      </p>
      {teacher && workspace && (
        <section className="panel">
          <h2>학급·학생·기간 선택</h2>
          <form method="get">
            <label className="field">
              담당 학급
              <select name="classroom" defaultValue={cls ?? ""}>
                {ownedClasses.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              학생 이름·아이디 찾기
              <input
                name="q"
                defaultValue={workspace.pages?.q}
                maxLength={80}
              />
            </label>
            <button className="button button-outline">학급·명단 확인</button>
          </form>
          <p>
            현재 명단 {workspace.students.length}명 / 검색 결과{" "}
            {workspace.totals?.students ?? 0}명
          </p>
          <form method="get">
            <input type="hidden" name="classroom" value={cls ?? ""} />
            <input type="hidden" name="q" value={workspace.pages?.q ?? ""} />
            <input
              type="hidden"
              name="studentPage"
              value={workspace.pages?.studentPage ?? 1}
            />
            <label className="field">
              보고서 학생
              <select name="student" defaultValue={student ?? ""} required>
                <option value="">학생을 선택해 주세요</option>
                {student &&
                  !workspace.students.some((s) => s.id === student) &&
                  state && (
                    <option value={student}>{state.student.name}</option>
                  )}
                {workspace.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name} · {s.login_id ?? "개인 계정"}
                  </option>
                ))}
              </select>
            </label>
            <div className="hub-row">
              <label className="field">
                시작일 · 비우면 전체 기간
                <input type="date" name="from" defaultValue={from ?? ""} />
              </label>
              <label className="field">
                종료일
                <input type="date" name="until" defaultValue={until ?? ""} />
              </label>
            </div>
            <button className="button button-primary">
              성장 기록 불러오기
            </button>
          </form>
          <nav className="hub-inline" aria-label="학생 명단 페이지">
            {(workspace.pages?.studentPage ?? 1) > 1 && (
              <Link
                href={href({
                  studentPage: String((workspace.pages?.studentPage ?? 1) - 1),
                })}
              >
                이전 학생
              </Link>
            )}
            {(workspace.pages?.studentPage ?? 1) * studentsPerPage <
              (workspace.totals?.students ?? 0) && (
              <Link
                href={href({
                  studentPage: String((workspace.pages?.studentPage ?? 1) + 1),
                })}
              >
                다음 학생
              </Link>
            )}
          </nav>
        </section>
      )}
      {!datesValid && (
        <p role="alert" className="notice">
          시작일·종료일을 함께 입력하고, 3년 이내의 올바른 순서로 선택해 주세요.
        </p>
      )}
      {teacher && staffClass?.review && cls && datesValid && (
        <ReportBatch
          key={JSON.stringify([cls, from, until])}
          classroom={cls}
          from={from}
          until={until}
        />
      )}
      {state && staffClass?.review && (
        <>
          <ReportComposer
            key={JSON.stringify([cls, student, from, until, worksPage])}
            state={state}
          />
          <nav className="hub-inline" aria-label="대표 작품 페이지">
            {worksPage > 1 && (
              <Link href={href({ worksPage: String(worksPage - 1) })}>
                이전 작품
              </Link>
            )}
            {worksPage * 20 < state.candidateTotal && (
              <Link href={href({ worksPage: String(worksPage + 1) })}>
                다음 작품
              </Link>
            )}
          </nav>
        </>
      )}
      <ReportArchive
        reports={(reports.data ?? []) as GrowthReport[]}
        teacher={teacher && staffClass?.review === true}
      />
      <nav className="hub-inline" aria-label="저장한 보고서 페이지">
        <span>
          {reports.count ?? 0}건 · {page}페이지
        </span>
        {page > 1 && (
          <Link href={href({ page: String(page - 1) })}>이전 보고서</Link>
        )}
        {page * 10 < (reports.count ?? 0) && (
          <Link href={href({ page: String(page + 1) })}>다음 보고서</Link>
        )}
      </nav>
      <Link href="/hub?tab=terms" className="text-link">
        학기 종료·진급 관리 →
      </Link>
    </div>
  );
}
