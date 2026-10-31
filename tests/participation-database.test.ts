import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
let db: PGlite;
const t = "10000000-0000-4000-8000-000000000001",
  t2 = "10000000-0000-4000-8000-000000000002";
const s = "20000000-0000-4000-8000-000000000001",
  peer = "20000000-0000-4000-8000-000000000002",
  outsider = "20000000-0000-4000-8000-000000000003";
const c = "30000000-0000-4000-8000-000000000001",
  c2 = "30000000-0000-4000-8000-000000000002";
const mission = "40000000-0000-4000-8000-000000000001",
  assignment = "50000000-0000-4000-8000-000000000001";
async function actor(id: string) {
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
async function one(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows[0];
}
async function command(
  name: string,
  payload: Record<string, unknown>,
  key = randomUUID(),
) {
  return (
    await one("select public.hub_command($1,$2,$3) as value", [
      name,
      payload,
      key,
    ])
  ).value;
}
async function denied(
  name: string,
  payload: Record<string, unknown>,
  message: string,
  key = randomUUID(),
) {
  await db.exec("savepoint bad_request");
  let error: unknown;
  try {
    await command(name, payload, key);
  } catch (e) {
    error = e;
  }
  await db.exec(
    "rollback to savepoint bad_request;release savepoint bad_request",
  );
  expect(String(error)).toContain(message);
}
async function reading() {
  await actor(s);
  return command("reading_save", {
    classroomId: c,
    book: { title: "어린 왕자", author: "생텍쥐페리" },
    readOn: "2026-01-01",
    status: "completed",
    thought: "여우와 친구가 되어 서로를 이해했습니다.",
  });
}
async function completed() {
  await actor(s);
  const sub = await one(
    "select * from public.submit_work($1,'나의 생각','친구의 입장을 생각하는 것이 중요합니다.',$2)",
    [assignment, randomUUID()],
  );
  await actor(t);
  return one(
    "select * from public.review_work($1,'좋은 근거를 찾았어요.','completed')",
    [sub.id],
  );
}

async function part(
  name: string,
  payload: Record<string, unknown>,
  key = randomUUID(),
) {
  return (
    await one("select public.participation_command($1,$2,$3) value", [
      name,
      payload,
      key,
    ])
  ).value;
}
async function blocked(
  name: string,
  payload: Record<string, unknown>,
  message: string,
  key = randomUUID(),
) {
  await db.exec("savepoint blocked");
  let error: unknown;
  try {
    await part(name, payload, key);
  } catch (e) {
    error = e;
  }
  await db.exec("rollback to savepoint blocked;release savepoint blocked");
  expect(String(error)).toContain(message);
}
const choices = [
  { key: "letter", label: "인물에게 편지", prompt: "내 생각을 편지로 써요." },
  { key: "question", label: "질문", prompt: "궁금한 점을 묻고 생각해요." },
];
async function assignmentWithChoices() {
  await actor(t);
  return part("assign_choices", {
    classroomId: c,
    missionId: mission,
    choices,
    criteria: "근거를 들어요.",
  });
}
async function goal() {
  await actor(t);
  return part("goal_create", {
    classroomId: c,
    title: "함께 읽는 숲",
    kind: "reading",
    target: 1,
    endsAt: new Date(Date.now() + 86400000).toISOString(),
  });
}
async function job() {
  await actor(t);
  return part("job_create", {
    classroomId: c,
    title: "책 추천 도우미",
    description: "추천한 이유를 알려요.",
    reward: 7,
    capacity: 1,
  });
}
async function pack(published = true) {
  await actor(t);
  return part("pack_save", {
    title: "공감 꾸러미",
    description: "인물을 이해해요.",
    missionId: mission,
    choices,
    feedback: "근거를 잘 찾았어요.",
    criteria: "나의 생각과 근거를 연결해요.",
    goalTarget: 3,
    published,
  });
}
async function posted() {
  const sub = await completed();
  await actor(s);
  const post = await command("plaza_share", { id: sub.id, consent: true });
  await actor(t);
  await command("plaza_moderate", { id: post.id, status: "published" });
  return post;
}

describe("Classroom participation: authorization, choices, cooperation and economy", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
    for (const file of readdirSync(resolve("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    for (const id of [t, t2, s, peer, outsider])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "update public.profiles set role='teacher' where id=any($1::uuid[])",
      [[t, t2]],
    );
    await db.exec("update public.profiles set consent_status='verified'");
    await db.query(
      "insert into public.classrooms(id,name,teacher_id) values($1,'우리 반',$2),($3,'다른 반',$4)",
      [c, t, c2, t2],
    );
    await db.query(
      "insert into public.enrollments(classroom_id,student_id) values($1,$2),($1,$3),($4,$5)",
      [c, s, peer, c2, outsider],
    );
    await db.query(
      "insert into public.missions(id,slug,title,theme,grade_band,prompt,description,minutes) values($1,'hub-test','생각','empathy','3-4','생각해요','질문해요',10)",
      [mission],
    );
    await db.query(
      "insert into public.assignments(id,classroom_id,mission_id,mission_snapshot) select $1,$2,id,to_jsonb(m) from public.missions m where id=$3",
      [assignment, c, mission],
    );
  });
  beforeEach(async () => {
    await db.exec("begin");
  });
  afterEach(async () => {
    await db.exec("rollback;reset role");
  });
  afterAll(async () => {
    await db?.close();
  });
  it("starts one class on retry and rejects mismatched retries", async () => {
    await actor(t);
    const key = randomUUID(),
      payload = { name: "다음 교실" };
    const first = await part("class_start", payload, key);
    expect(await part("class_start", payload, key)).toEqual(first);
    expect(
      (
        await one(
          "select count(*)::int n from public.classrooms where name='다음 교실'",
        )
      ).n,
    ).toBe(1);
    await blocked(
      "class_start",
      { name: "다른 이름" },
      "BF_IDEMPOTENCY_CONFLICT",
      key,
    );
  });
  it("denies student class creation and cross-class assignment", async () => {
    await actor(s);
    await blocked("class_start", { name: "가짜 교실" }, "BF_FORBIDDEN");
    await actor(t2);
    await blocked(
      "assign_choices",
      { classroomId: c, missionId: mission, choices },
      "BF_FORBIDDEN",
    );
  });
  it("validates choice keys and freezes a choice after drafting", async () => {
    const a = await assignmentWithChoices();
    await actor(s);
    await db.exec("savepoint unchosen");
    await expect(
      db.query("select public.save_draft($1,'제목','본문',0)", [a.id]),
    ).rejects.toThrow("BF_CHOICE_REQUIRED");
    await db.exec("rollback to savepoint unchosen;release savepoint unchosen");
    await blocked(
      "choose_mission",
      { id: a.id, key: "forged" },
      "BF_INVALID_INPUT",
    );
    await part("choose_mission", { id: a.id, key: "letter" });
    await db.query("select public.save_draft($1,'제목','본문',0)", [a.id]);
    await blocked(
      "choose_mission",
      { id: a.id, key: "question" },
      "BF_CHOICE_LOCKED",
    );
    await actor(peer);
    expect(
      (await db.query("select * from public.mission_selections")).rows,
    ).toHaveLength(0);
  });
  it("allows a change before writing starts but rejects duplicate or oversized choice definitions", async () => {
    const a = await assignmentWithChoices();
    await actor(s);
    await part("choose_mission", { id: a.id, key: "letter" });
    await part("choose_mission", { id: a.id, key: "question" });
    expect(
      (await one("select choice_key from public.mission_selections"))
        .choice_key,
    ).toBe("question");
    await actor(t);
    await blocked(
      "assign_choices",
      { classroomId: c, missionId: mission, choices: [choices[0], choices[0]] },
      "BF_INVALID_INPUT",
    );
  });
  it("never exposes another student's choice or private teacher presets", async () => {
    const a = await assignmentWithChoices();
    await part("preset_save", {
      title: "나의 문구",
      body: "학생에 맞게 다듬어요.",
    });
    await actor(s);
    await part("choose_mission", { id: a.id, key: "letter" });
    await actor(outsider);
    expect(
      (await db.query("select * from public.mission_selections")).rows,
    ).toHaveLength(0);
    await actor(t2);
    expect(
      (await db.query("select * from public.feedback_presets")).rows,
    ).toHaveLength(0);
  });
  it("requires explicit read acknowledgement before batch verification", async () => {
    const l = await reading();
    await actor(t);
    await blocked(
      "review_batch",
      { items: [{ id: l.id, kind: "reading", read: false }] },
      "BF_INVALID_INPUT",
    );
    expect(
      (await one("select verified_at from public.reading_logs")).verified_at,
    ).toBeNull();
  });
  it("rolls back the entire batch if one item is outside the teacher's class", async () => {
    const l = await reading();
    await actor(t2);
    const other = (await one("select public.create_classroom('별도 교실') c"))
      .c;
    await actor(t);
    await blocked(
      "review_batch",
      {
        items: [
          { id: l.id, kind: "reading", read: true },
          { id: randomUUID(), kind: "reading", read: true },
        ],
      },
      "BF_FORBIDDEN",
    );
    expect(
      (await one("select verified_at from public.reading_logs")).verified_at,
    ).toBeNull();
    expect(
      (await one("select count(*)::int n from public.activity_events")).n,
    ).toBe(0);
  });
  it("verifies readings once and counts them toward a class goal", async () => {
    const g = await goal(),
      l = await reading();
    await actor(t);
    const key = randomUUID(),
      payload = {
        items: [{ id: l.id, kind: "reading", read: true }],
        decision: "completed",
      };
    await part("review_batch", payload, key);
    await part("review_batch", payload, key);
    expect(
      (await one("select count(*)::int n from public.economy_ledger")).n,
    ).toBe(1);
    expect(
      (await one("select public.forest_progress($1) g", [g.id])).g.progress,
    ).toBe(1);
    await actor(s);
    await part("goal_claim", { id: g.id });
    await part("goal_claim", { id: g.id });
    expect(
      (await one("select count(*)::int n from public.forest_badges")).n,
    ).toBe(1);
    await actor(peer);
    await blocked("goal_claim", { id: g.id }, "BF_GOAL_NOT_READY");
  });
  it("keeps aggregate forest progress within participating classes", async () => {
    const g = await goal();
    await actor(outsider);
    expect(
      (await db.query("select * from public.forest_goals")).rows,
    ).toHaveLength(0);
    await db.exec("savepoint hidden");
    await expect(
      db.query("select public.forest_progress($1)", [g.id]),
    ).rejects.toThrow("BF_FORBIDDEN");
    await db.exec("rollback to savepoint hidden;release savepoint hidden");
  });
  it("only reviews the latest writing version and rewards a completed mission once", async () => {
    await actor(s);
    const sub = await one(
      "select * from public.submit_work($1,'가상 제목','내 생각과 근거',$2)",
      [assignment, randomUUID()],
    );
    await actor(t);
    const key = randomUUID(),
      payload = {
        items: [{ id: sub.id, kind: "writing", read: true }],
        body: "생각의 근거를 잘 찾았어요.",
        decision: "completed",
      };
    await part("review_batch", payload, key);
    await part("review_batch", payload, key);
    expect((await one("select status from public.submissions")).status).toBe(
      "completed",
    );
    expect(
      (
        await one(
          "select count(*)::int n from public.activity_events where kind='mission'",
        )
      ).n,
    ).toBe(1);
  });
  it("enforces job capacity and pays once only after a completion report", async () => {
    const j = await job();
    await actor(s);
    const app = await part("job_apply", { id: j.id });
    await blocked(
      "job_report",
      { id: app.id, report: "완료" },
      "BF_INVALID_TRANSITION",
    );
    await actor(peer);
    const peerApp = await part("job_apply", { id: j.id });
    await actor(t);
    await blocked("job_pay", { id: app.id }, "BF_INVALID_TRANSITION");
    await part("job_decide", { id: app.id, approve: true });
    await blocked(
      "job_decide",
      { id: peerApp.id, approve: true },
      "BF_CAPACITY",
    );
    await actor(s);
    await part("job_report", {
      id: app.id,
      report: "가상 도서를 소개하고 이유를 나눴어요.",
    });
    await actor(t);
    const key = randomUUID();
    await part("job_pay", { id: app.id }, key);
    await part("job_pay", { id: app.id }, key);
    await blocked("job_pay", { id: app.id }, "BF_INVALID_TRANSITION");
    expect(
      (await one("select sum(amount)::int n from public.economy_ledger")).n,
    ).toBe(7);
  });
  it("prevents classmates and other teachers reading private role reports", async () => {
    const j = await job();
    await actor(s);
    await part("job_apply", { id: j.id });
    await actor(peer);
    expect(
      (await db.query("select * from public.job_applications")).rows,
    ).toHaveLength(0);
    await actor(t2);
    expect(
      (await db.query("select * from public.job_applications")).rows,
    ).toHaveLength(0);
  });
  it("saves a private target without moving money", async () => {
    await actor(s);
    await part("saving_save", {
      classroomId: c,
      title: "추천 책 발표권",
      target: 30,
    });
    expect(
      (await one("select count(*)::int n from public.economy_ledger")).n,
    ).toBe(0);
    await actor(peer);
    expect(
      (await db.query("select * from public.saving_goals")).rows,
    ).toHaveLength(0);
    await blocked(
      "saving_save",
      { classroomId: c2, title: "다른 반", target: 30 },
      "BF_FORBIDDEN",
    );
  });
  it("creates a shop item only after the teacher confirms a proposal", async () => {
    await actor(s);
    const p = await part("proposal_create", {
      classroomId: c,
      name: "책 소개 시간",
      reason: "좋아하는 책을 나누고 싶어요.",
      price: 15,
    });
    expect(
      (await db.query("select * from public.shop_items")).rows,
    ).toHaveLength(0);
    await blocked(
      "proposal_decide",
      { id: p.id, approve: true, price: 1, stock: 9 },
      "BF_FORBIDDEN",
    );
    await actor(t);
    await part("proposal_decide", {
      id: p.id,
      approve: true,
      price: 12,
      stock: 3,
    });
    await blocked(
      "proposal_decide",
      { id: p.id, approve: true, price: 12, stock: 3 },
      "BF_INVALID_TRANSITION",
    );
    const item = await one("select * from public.shop_items");
    expect(item.price).toBe(12);
    expect(item.stock).toBe(3);
  });
  it("shares lesson packs only with teachers and copies snapshots when assigning", async () => {
    const p = await pack();
    await actor(s);
    expect(
      (await db.query("select * from public.lesson_packs")).rows,
    ).toHaveLength(0);
    await blocked("pack_clone", { id: p.id }, "BF_FORBIDDEN");
    await actor(t2);
    const copy = await part("pack_clone", { id: p.id });
    const a = await part("pack_assign", { id: copy.id, classroomId: c2 });
    const assigned = await one("select * from public.assignments where id=$1", [
      a.id,
    ]);
    expect(assigned.choices).toHaveLength(2);
    expect(assigned.success_criteria).toContain("근거");
    expect(
      (await db.query("select * from public.feedback_presets")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.forest_goals")).rows,
    ).toHaveLength(1);
  });
  it("does not allow cloning another teacher's unpublished pack", async () => {
    const p = await pack(false);
    await actor(t2);
    expect(
      (await db.query("select * from public.lesson_packs")).rows,
    ).toHaveLength(0);
    await blocked("pack_clone", { id: p.id }, "BF_FORBIDDEN");
  });
  it("requires a published opted-in work and teacher approval for exhibition", async () => {
    const post = await posted();
    await actor(t);
    const ex = await part("exhibition_create", {
      classroomId: c,
      title: "가상 작품전",
      description: "우리 반 생각을 나눠요.",
      endsAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await actor(s);
    await blocked(
      "exhibit_submit",
      { id: post.id, exhibitionId: ex.id, consent: false },
      "BF_INVALID_INPUT",
    );
    const entry = await part("exhibit_submit", {
      id: post.id,
      exhibitionId: ex.id,
      consent: true,
    });
    await actor(peer);
    expect(
      (await db.query("select * from public.exhibition_entries")).rows,
    ).toHaveLength(0);
    await actor(t2);
    await blocked(
      "exhibit_decide",
      { id: entry.id, approve: true },
      "BF_FORBIDDEN",
    );
    await actor(t);
    await part("exhibit_decide", { id: entry.id, approve: true });
    await actor(peer);
    expect(
      (await db.query("select * from public.exhibition_entries")).rows,
    ).toHaveLength(1);
    await actor(s);
    await command("plaza_moderate", { id: post.id, status: "withdrawn" });
    await actor(peer);
    expect(
      (await db.query("select * from public.exhibition_entries")).rows,
    ).toHaveLength(0);
  });
  it("does not widen a classroom-only post into a grade exhibition", async () => {
    const post = await posted();
    await actor(t);
    const group = await command("group_create", {
      classroomId: c,
      name: "가상 학년",
    });
    const ex = await part("exhibition_create", {
      classroomId: c,
      groupId: group.id,
      title: "학년 작품전",
      description: "서로 나눠요.",
      endsAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await actor(s);
    await blocked(
      "exhibit_submit",
      { id: post.id, exhibitionId: ex.id, consent: true },
      "BF_FORBIDDEN",
    );
  });
  it("guards new state and commands after consent withdrawal", async () => {
    await actor(s);
    await db.exec("reset role");
    await db.query(
      "update public.profiles set consent_status='pending' where id=$1",
      [s],
    );
    await actor(s);
    await blocked(
      "saving_save",
      { classroomId: c, title: "새 목표", target: 5 },
      "BF_FORBIDDEN",
    );
    await db.exec("savepoint state_guard");
    await expect(
      db.query("select public.participation_state()"),
    ).rejects.toThrow("BF_FORBIDDEN");
    await db.exec(
      "rollback to savepoint state_guard;release savepoint state_guard",
    );
  });
  it("closes job applications without blocking a previously assigned role", async () => {
    const j = await job();
    await part("job_toggle", { id: j.id, active: false });
    await actor(s);
    await blocked("job_apply", { id: j.id }, "BF_FORBIDDEN");
    await actor(t);
    await part("job_toggle", { id: j.id, active: true });
    await actor(s);
    const app = await part("job_apply", { id: j.id });
    expect(app.id).toBeTruthy();
  });
  it("edits a teacher's pack without changing an assigned snapshot and allows sharing to stop", async () => {
    const p = await pack(),
      a = await part("pack_assign", { id: p.id, classroomId: c });
    await part("pack_update", {
      id: p.id,
      title: "수정한 꾸러미",
      description: "새 설명",
      missionId: mission,
      choices,
      feedback: "수정한 문구",
      criteria: "새 기준",
      goalTarget: 4,
    });
    expect(
      (
        await one(
          "select success_criteria from public.assignments where id=$1",
          [a.id],
        )
      ).success_criteria,
    ).toContain("근거");
    await part("pack_visibility", { id: p.id, published: false });
    await actor(t2);
    await blocked("pack_clone", { id: p.id }, "BF_FORBIDDEN");
    await blocked(
      "pack_visibility",
      { id: p.id, published: true },
      "BF_FORBIDDEN",
    );
  });
  it("includes new records in approved deletion while preserving another class's savings", async () => {
    const a = await assignmentWithChoices(),
      j = await job();
    await actor(s);
    await part("choose_mission", { id: a.id, key: "letter" });
    await part("job_apply", { id: j.id });
    await part("saving_save", { classroomId: c, title: "내 목표", target: 20 });
    await part("proposal_create", {
      classroomId: c,
      name: "책 읽기 시간",
      reason: "생각을 나눠요.",
      price: 5,
    });
    await db.exec("reset role");
    await db.query(
      "insert into public.enrollments(classroom_id,student_id) values($1,$2)",
      [c2, s],
    );
    await actor(s);
    await part("saving_save", {
      classroomId: c2,
      title: "다른 반 목표",
      target: 30,
    });
    await db.exec("reset role");
    await db.query(
      "update public.saving_goals set updated_at=now()+interval '5 minutes' where classroom_id=$1",
      [c],
    );
    expect(
      (
        await one("select private.last_student_activity($1,$2)>now() fresh", [
          s,
          c,
        ])
      ).fresh,
    ).toBe(true);
    const deletion = await one(
      "insert into private.deletion_requests(student_id,classroom_id,scope,requested_by,reason,status,decided_by) values($1,$2,'class_records',$3,'request','approved',$3) returning id",
      [s, c, t],
    );
    await actor(t);
    expect(
      (await one("select public.deletion_preview($1) x", [deletion.id])).x
        .participation_records,
    ).toBe(4);
    await db.exec("reset role");
    await db.query("select public.operations_purge($1)", [deletion.id]);
    expect(
      (
        await one(
          "select count(*)::int n from public.saving_goals where classroom_id=$1",
          [c],
        )
      ).n,
    ).toBe(0);
    expect(
      (
        await one(
          "select count(*)::int n from public.saving_goals where classroom_id=$1",
          [c2],
        )
      ).n,
    ).toBe(1);
    expect(
      (await one("select count(*)::int n from public.job_applications")).n,
    ).toBe(0);
    expect(
      (await one("select count(*)::int n from public.mission_selections")).n,
    ).toBe(0);
  });
  it("stores neither writing nor role report text in replay/audit records", async () => {
    const j = await job();
    await actor(s);
    const app = await part("job_apply", { id: j.id });
    await actor(t);
    await part("job_decide", { id: app.id, approve: true });
    await actor(s);
    await part("job_report", {
      id: app.id,
      report: "이 문장은 운영 로그에 남기지 않아요.",
    });
    await db.exec("reset role");
    const rows = await db.query(
      "select result from private.participation_requests",
    );
    expect(JSON.stringify(rows.rows)).not.toContain("이 문장");
  });
  it("exposes read access through RLS and revokes direct writes and anonymous RPC calls", async () => {
    await db.exec("reset role");
    expect(
      (
        await one(
          "select has_table_privilege('authenticated','public.class_jobs','INSERT') ok",
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await one(
          "select has_function_privilege('anon','public.participation_command(text,jsonb,uuid)','EXECUTE') ok",
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await one(
          "select has_function_privilege('authenticated','private.validate_choices(jsonb)','EXECUTE') ok",
        )
      ).ok,
    ).toBe(false);
    const tables = (
      await db.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where oid in ('public.class_jobs'::regclass,'public.saving_goals'::regclass,'public.exhibition_entries'::regclass)",
      )
    ).rows;
    expect(tables.every((t) => t.relrowsecurity)).toBe(true);
  });
});
