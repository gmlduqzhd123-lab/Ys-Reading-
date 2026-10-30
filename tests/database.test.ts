import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const ids = {
  teacher: "10000000-0000-4000-8000-000000000001",
  otherTeacher: "10000000-0000-4000-8000-000000000002",
  student: "20000000-0000-4000-8000-000000000001",
  peer: "20000000-0000-4000-8000-000000000002",
  outsider: "20000000-0000-4000-8000-000000000003",
  pending: "20000000-0000-4000-8000-000000000004",
  classroom: "30000000-0000-4000-8000-000000000001",
  otherClassroom: "30000000-0000-4000-8000-000000000002",
  mission: "40000000-0000-4000-8000-000000000001",
  revisionMission: "40000000-0000-4000-8000-000000000002",
  assignment: "50000000-0000-4000-8000-000000000001",
  revisionAssignment: "50000000-0000-4000-8000-000000000002",
  otherAssignment: "50000000-0000-4000-8000-000000000003",
  contest: "60000000-0000-4000-8000-000000000001",
};
const request = (suffix: number) => `70000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
type Row = Record<string, unknown>;
let db: PGlite;

async function asUser(id: string) {
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}

async function admin() {
  await db.exec("reset role");
}

async function one<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<T>(sql, params);
  if (!result.rows[0]) throw new Error("Expected a database row");
  return result.rows[0];
}

// A failing SQL statement aborts the transaction: roll back only that statement.
async function rejected(sql: string, params: unknown[], message: string) {
  await db.exec("savepoint expected_error");
  let error: unknown;
  try { await db.query(sql, params); } catch (caught) { error = caught; }
  await db.exec("rollback to savepoint expected_error; release savepoint expected_error");
  expect(String(error)).toContain(message);
}

async function submit(assignment = ids.assignment, suffix = 1, body = "주인공이 두려워도 친구를 도운 까닭을 생각했습니다.") {
  await asUser(ids.student);
  return one("select * from public.submit_work($1,$2,$3,$4)", [assignment, "용기의 뜻", body, request(suffix)]);
}

async function completedWork(suffix = 1) {
  const submission = await submit(ids.assignment, suffix);
  await asUser(ids.teacher);
  return one("select * from public.review_work($1,$2,$3)", [submission.id, "책 속 장면과 생각을 연결했어요.", "completed"]);
}

async function entry(suffix = 1) {
  const submission = await completedWork(suffix);
  await asUser(ids.student);
  return one("select * from public.enter_contest($1,$2,$3)", [ids.contest, submission.id, request(100 + suffix)]);
}

describe("Supabase migration: actual PostgreSQL authorization and transitions", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
    `);
    const dir = resolve(process.cwd(), "supabase/migrations");
    const migration = readdirSync(dir).find((name) => name.endsWith("_initial_bookforest.sql"));
    if (!migration) throw new Error("Initial migration is missing");
    await db.exec(readFileSync(resolve(dir, migration), "utf8"));
    for (const id of [ids.teacher, ids.otherTeacher, ids.student, ids.peer, ids.outsider, ids.pending]) {
      await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)", [id, { display_name: "테스트 독자", role: "teacher", consent_status: "verified" }]);
    }
    await db.query("update public.profiles set role='teacher' where id=any($1::uuid[])", [[ids.teacher, ids.otherTeacher]]);
    await db.query("update public.profiles set consent_status='verified' where id<>$1", [ids.pending]);
    await db.query("insert into public.classrooms(id,name,teacher_id) values($1,'우리 학급',$2),($3,'다른 학급',$4)", [ids.classroom, ids.teacher, ids.otherClassroom, ids.otherTeacher]);
    await db.query("insert into public.enrollments(classroom_id,student_id) values($1,$2),($1,$3),($1,$4),($5,$6)", [ids.classroom, ids.student, ids.peer, ids.pending, ids.otherClassroom, ids.outsider]);
    await db.query(`insert into public.missions(id,slug,title,theme,grade_band,prompt,description,minutes,requires_revision)
      values($1,'test-courage','용기','courage','3-4','어떤 장면이었나요?','용기를 생각해요',10,false),
      ($2,'test-revision','고쳐 쓰기','empathy','5-6','생각이 달라졌나요?','다시 써요',15,true)`, [ids.mission, ids.revisionMission]);
    await db.query(`insert into public.assignments(id,classroom_id,mission_id,mission_snapshot,due_at)
      select $1,$2,id,to_jsonb(m),now()+interval '1 day' from public.missions m where id=$3`, [ids.assignment, ids.classroom, ids.mission]);
    await db.query(`insert into public.assignments(id,classroom_id,mission_id,mission_snapshot)
      select $1,$2,id,to_jsonb(m) from public.missions m where id=$3`, [ids.revisionAssignment, ids.classroom, ids.revisionMission]);
    await db.query(`insert into public.assignments(id,classroom_id,mission_id,mission_snapshot)
      select $1,$2,id,to_jsonb(m) from public.missions m where id=$3`, [ids.otherAssignment, ids.otherClassroom, ids.mission]);
    await db.query("insert into public.contests(id,classroom_id,title,description,opens_at,closes_at) values($1,$2,'우리의 용기','책에서 찾은 용기',now()-interval '1 day',now()+interval '1 day')", [ids.contest, ids.classroom]);
  });

  beforeEach(async () => { await db.exec("begin"); });
  afterEach(async () => { await db.exec("reset role; rollback"); });
  afterAll(async () => { await db?.close(); });

  it("ignores forged metadata and denies client role, consent, reward and membership writes", async () => {
    await asUser(ids.pending);
    const profile = await one("select * from public.profiles where id=$1", [ids.pending]);
    expect(profile.role).toBe("student");
    expect(profile.consent_status).toBe("pending");
    await rejected("update public.profiles set role='teacher',consent_status='verified' where id=$1", [ids.pending], "permission denied");
    await rejected("insert into public.enrollments(classroom_id,student_id) values($1,$2)", [ids.otherClassroom, ids.pending], "permission denied");
    await rejected("select * from public.create_classroom('가짜 학급')", [], "BF_FORBIDDEN");
    await rejected("insert into public.badges(student_id,code,source_submission_id) values($1,'first_mission',$2)", [ids.pending, ids.assignment], "permission denied");
    expect((await db.query("select * from public.classrooms")).rows).toHaveLength(0);
    await rejected("select * from public.save_draft($1,'제목','본문',0)", [ids.assignment], "BF_FORBIDDEN");
    await rejected("select * from public.submit_work($1,'제목','본문',$2)", [ids.assignment, request(1)], "BF_FORBIDDEN");
  });

  it("isolates other classes and peers, while teachers cannot read student drafts", async () => {
    const submission = await submit();
    await one("select * from public.save_draft($1,'비공개 초안','아직 선생님께 보내지 않은 생각',0)", [ids.assignment]);
    await asUser(ids.peer);
    expect((await db.query("select * from public.submissions")).rows).toHaveLength(0);
    expect((await db.query("select * from public.drafts")).rows).toHaveLength(0);
    await asUser(ids.otherTeacher);
    expect((await db.query("select * from public.submissions where id=$1", [submission.id])).rows).toHaveLength(0);
    await rejected("select * from public.review_work($1,'잘했어요','completed')", [submission.id], "BF_FORBIDDEN");
    await asUser(ids.teacher);
    expect((await db.query("select * from public.submissions")).rows).toHaveLength(1);
    expect((await db.query("select * from public.drafts")).rows).toHaveLength(0);
    await asUser(ids.outsider);
    await rejected("select * from public.submit_work($1,'제목','본문',$2)", [ids.assignment, request(2)], "BF_FORBIDDEN");
  });

  it("checks draft revisions and preserves the winner on stale saves", async () => {
    await asUser(ids.student);
    const first = await one("select * from public.save_draft($1,'첫 제목','첫 생각',0)", [ids.assignment]);
    expect(first.revision).toBe(1);
    const second = await one("select * from public.save_draft($1,'둘째 제목','다듬은 생각',1)", [ids.assignment]);
    expect(second.id).toBe(first.id);
    expect(second.revision).toBe(2);
    await rejected("select * from public.save_draft($1,'오래된 탭','옛 생각',1)", [ids.assignment], "BF_DRAFT_CONFLICT");
    expect((await one("select * from public.drafts where id=$1", [first.id])).body).toBe("다듬은 생각");
  });

  it("returns one immutable submission on retry, and rejects reused keys with new payloads", async () => {
    const first = await submit();
    const retry = await submit();
    expect(retry.id).toBe(first.id);
    expect((await one("select count(*)::int as n from public.submissions")).n).toBe(1);
    await rejected("select * from public.submit_work(null,'용기의 뜻',$1,$2)", [first.body, request(1)], "BF_INVALID_INPUT");
    await rejected("select * from public.submit_work($1,'바뀐 제목','바뀐 본문',$2)", [ids.assignment, request(1)], "BF_IDEMPOTENCY_CONFLICT");
    await rejected("update public.submissions set body='조작' where id=$1", [first.id], "permission denied");
    await admin();
    await rejected("update public.submissions set body='관리자 실수' where id=$1", [first.id], "BF_IMMUTABLE_SUBMISSION");
  });

  it("enforces raw text limits even when clients bypass form validation", async () => {
    await asUser(ids.student);
    await rejected("select * from public.save_draft($1,$2,'본문',0)", [ids.assignment, "가".repeat(101)], "BF_INVALID_INPUT");
    await rejected("select * from public.submit_work($1,'제목',$2,$3)", [ids.assignment, "가" + " ".repeat(10000), request(1)], "BF_INVALID_INPUT");
    expect((await one("select count(*)::int as n from public.submissions")).n).toBe(0);
  });

  it("requires a real revision, rejects stale reviews, and awards badges once", async () => {
    const first = await submit(ids.revisionAssignment);
    await asUser(ids.teacher);
    await rejected("select * from public.review_work($1,'완료','completed')", [first.id], "BF_REVISION_REQUIRED");
    await one("select * from public.review_work($1,'장면을 하나 더 들어 볼까요?','revision_requested')", [first.id]);
    await asUser(ids.student);
    await rejected("select * from public.submit_work($1,$2,$3,$4)", [ids.revisionAssignment, first.title, first.body, request(2)], "BF_REVISION_UNCHANGED");
    const second = await submit(ids.revisionAssignment, 2, "친구를 도운 장면을 추가했습니다. 저는 다음에 손을 내밀고 싶습니다.");
    expect(second.version).toBe(2);
    await asUser(ids.teacher);
    await rejected("select * from public.review_work($1,'옛 글 완료','completed')", [first.id], "BF_STALE_SUBMISSION");
    const done = await one("select * from public.review_work($1,'생각의 근거가 더 분명해졌어요.','completed')", [second.id]);
    expect(done.status).toBe("completed");
    await one("select * from public.review_work($1,'생각의 근거가 더 분명해졌어요.','completed')", [second.id]);
    expect((await one("select count(*)::int as n from public.badges where student_id=$1", [ids.student])).n).toBe(2);
    expect((await one("select count(*)::int as n from public.feedback")).n).toBe(2);
  });

  it("freezes mission requirements at assignment time", async () => {
    await admin();
    await db.query("update public.missions set requires_revision=true,title='수정된 미션' where id=$1", [ids.mission]);
    const done = await completedWork();
    expect(done.status).toBe("completed");
    await asUser(ids.teacher);
    const assigned = await one("select * from public.assign_mission($1,$2,null)", [ids.classroom, ids.mission]);
    expect((assigned.mission_snapshot as Row).requires_revision).toBe(true);
  });

  it("preserves completed versions and badges when a student voluntarily submits a new version", async () => {
    const completed = await completedWork();
    const revised = await submit(ids.assignment, 2, "완료 후에도 생각을 더해 고쳤습니다. 서로 다른 의견을 존중해야 합니다.");
    expect(revised.version).toBe(2);
    expect(revised.status).toBe("submitted");
    expect((await one("select * from public.submissions where id=$1", [completed.id])).status).toBe("completed");
    expect((await one("select count(*)::int as n from public.badges")).n).toBe(1);
    const entered = await one("select * from public.enter_contest($1,$2,$3)", [ids.contest, completed.id, request(101)]);
    expect(entered.submission_id).toBe(completed.id);
    await rejected("select * from public.submit_work($1,'세 번째','아직 검토되지 않은 새 글',$2)", [ids.assignment, request(3)], "BF_REVISION_NOT_REQUESTED");
  });

  it("awards the three-theme badge only after all three themes have completed work", async () => {
    await completedWork();
    await admin();
    const themeAssignments: string[] = [];
    for (const [theme, suffix] of [["empathy", 3], ["fairness", 4]] as const) {
      const mission = await one(`insert into public.missions(slug,title,theme,grade_band,prompt,description,minutes)
        values($1,$2,$3,'3-4','생각해 보세요','주제 미션',10) returning *`, [`theme-${suffix}`, theme, theme]);
      const assigned = await one(`insert into public.assignments(classroom_id,mission_id,mission_snapshot)
        values($1,$2,$3) returning *`, [ids.classroom, mission.id, mission]);
      themeAssignments.push(assigned.id as string);
    }
    for (const [index, assignment] of themeAssignments.entries()) {
      const work = await submit(assignment, index + 3);
      await asUser(ids.teacher);
      await one("select * from public.review_work($1,'주제를 잘 생각했어요','completed')", [work.id]);
      const badges = (await db.query<{ code: string }>("select code from public.badges where student_id=$1", [ids.student])).rows.map((row) => row.code);
      expect(badges.includes("three_themes")).toBe(index === 1);
    }
  });

  it("allows late learning submissions with a durable flag and preserves accepted retries", async () => {
    const first = await submit();
    await admin();
    // Test-time clock fixture: production assignments themselves are immutable.
    await db.exec("alter table public.assignments disable trigger assignment_immutable");
    await db.query("update public.assignments set due_at=clock_timestamp()-interval '1 second' where id=$1", [ids.assignment]);
    await db.exec("alter table public.assignments enable trigger assignment_immutable");
    const retry = await submit();
    expect(retry.id).toBe(first.id);
    expect(retry.is_late).toBe(false);
    await asUser(ids.peer);
    const late = await one("select * from public.submit_work($1,'새 글','늦은 글',$2)", [ids.assignment, request(2)]);
    expect(late.is_late).toBe(true);
  });

  it("copies completed work into one contest entry and recovers it after closing", async () => {
    const entered = await entry();
    expect(entered.body).toContain("주인공");
    await rejected("select * from public.enter_contest($1,$2,$3)", [ids.contest, entered.submission_id, request(102)], "BF_ALREADY_ENTERED");
    await admin();
    await db.query("update public.contests set closes_at=clock_timestamp()-interval '1 second' where id=$1", [ids.contest]);
    await asUser(ids.student);
    const retry = await one("select * from public.enter_contest($1,$2,$3)", [ids.contest, entered.submission_id, request(101)]);
    expect(retry.id).toBe(entered.id);
    expect(retry.receipt).toBe(entered.receipt);
    await rejected("select * from public.enter_contest($1,$2,$3)", [ids.contest, entered.submission_id, request(102)], "BF_CONTEST_CLOSED");
    await rejected("select * from public.enter_contest($1,$2,$3)", [ids.contest, ids.assignment, request(101)], "BF_IDEMPOTENCY_CONFLICT");
    await admin();
    await rejected("update public.entries set body='바꾸기' where id=$1", [entered.id], "BF_IMMUTABLE_SNAPSHOT");
  });

  it("enforces contest eligibility and blocks inactive membership", async () => {
    const submission = await submit();
    await rejected("select * from public.enter_contest($1,$2,$3)", [ids.contest, submission.id, request(101)], "BF_COMPLETED_WORK_REQUIRED");
    await asUser(ids.teacher);
    await one("select * from public.review_work($1,'생각을 잘 설명했어요','completed')", [submission.id]);
    await admin();
    await db.query("update public.enrollments set active=false where classroom_id=$1 and student_id=$2", [ids.classroom, ids.student]);
    await asUser(ids.student);
    await rejected("select * from public.enter_contest($1,$2,$3)", [ids.contest, submission.id, request(101)], "BF_FORBIDDEN");
    await rejected("select * from public.save_draft($1,'제목','본문',0)", [ids.assignment], "BF_FORBIDDEN");
  });

  it("validates review scores and hides results until complete publication", async () => {
    const entered = await entry();
    const scores = { thought: 26, evidence: 24, structure: 22, expression: 13 };
    await asUser(ids.teacher);
    await rejected("select * from public.submit_review($1,$2,'충분한 근거를 들었어요')", [entered.id, scores], "BF_CONTEST_STILL_OPEN");
    await admin();
    await db.query("update public.contests set closes_at=clock_timestamp()-interval '1 second' where id=$1", [ids.contest]);
    await asUser(ids.otherTeacher);
    await rejected("select * from public.submit_review($1,$2,'심사')", [entered.id, scores], "BF_FORBIDDEN");
    await asUser(ids.teacher);
    await rejected("select * from public.publish_contest($1)", [ids.contest], "BF_REVIEWS_INCOMPLETE");
    await rejected("select * from public.submit_review($1,$2,'심사')", [entered.id, { ...scores, thought: 31 }], "BF_INVALID_SCORES");
    await rejected("select * from public.submit_review($1,$2,'심사')", [entered.id, { ...scores, expression: null }], "BF_INVALID_SCORES");
    const review = await one("select * from public.submit_review($1,$2,'생각을 뒷받침하는 장면이 분명해요')", [entered.id, scores]);
    expect((await one("select * from public.contests where id=$1", [ids.contest])).status).toBe("reviewing");
    await asUser(ids.student);
    expect((await db.query("select * from public.reviews")).rows).toHaveLength(0);
    await asUser(ids.teacher);
    await one("select * from public.publish_contest($1)", [ids.contest]);
    await asUser(ids.student);
    expect((await one("select * from public.reviews")).id).toBe(review.id);
    await asUser(ids.peer);
    expect((await db.query("select * from public.reviews")).rows).toHaveLength(0);
  });

  it("requires authentication even for exposed RPCs and exposes no anon tables", async () => {
    await db.exec("reset role; set role anon");
    await db.query("select set_config('request.jwt.claim.sub','',true)");
    await rejected("select * from public.profiles", [], "permission denied");
    await rejected("select * from public.submit_work($1,'제목','본문',$2)", [ids.assignment, request(1)], "permission denied");
  });
});
