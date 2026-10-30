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
const op = "10000000-0000-4000-8000-000000000001",
  t = "10000000-0000-4000-8000-000000000002",
  t2 = "10000000-0000-4000-8000-000000000003";
const s = "20000000-0000-4000-8000-000000000001",
  peer = "20000000-0000-4000-8000-000000000002",
  other = "20000000-0000-4000-8000-000000000003";
const c = "30000000-0000-4000-8000-000000000001",
  c2 = "30000000-0000-4000-8000-000000000002";
const mission = "40000000-0000-4000-8000-000000000001",
  a = "50000000-0000-4000-8000-000000000001",
  a2 = "50000000-0000-4000-8000-000000000002";
async function actor(id: string, sid?: string) {
  await db.exec("reset role;set role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [id, JSON.stringify({ sub: id, session_id: sid })],
  );
}
async function owner() {
  await db.exec("reset role");
}
async function service() {
  await db.exec("reset role;set role service_role");
}
async function one(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows[0];
}
async function cmd(
  name: string,
  payload: Record<string, unknown>,
  key = randomUUID(),
) {
  return (
    await one("select public.operations_command($1,$2,$3) value", [
      name,
      payload,
      key,
    ])
  ).value;
}
async function denied(sql: string, args: unknown[], message: string) {
  await db.exec("savepoint denied");
  let error: unknown;
  try {
    await db.query(sql, args);
  } catch (e) {
    error = e;
  }
  await db.exec("rollback to savepoint denied;release savepoint denied");
  expect(String(error)).toContain(message);
}
async function approveDelete(student = s, cls: string | null = c) {
  await actor(cls ? t : student);
  const r = await cmd("deletion_request", {
    studentId: student,
    classroomId: cls,
  });
  await actor(op);
  await cmd("deletion_decide", { id: r.id, approve: true, confirmed: true });
  return r.id as string;
}
async function log(student = s, cls = c) {
  await actor(student);
  return (
    await one("select public.hub_command('reading_save',$1,$2) value", [
      {
        classroomId: cls,
        book: { title: "테스트 도서" },
        readOn: "2026-01-01",
        status: "completed",
        thought: "삭제 범위를 확인하는 가상 글입니다.",
      },
      randomUUID(),
    ])
  ).value;
}
describe("Account and record operations: authorization, session cutoff and deletion", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz not null default clock_timestamp());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`,
    );
    for (const f of readdirSync(resolve("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync(resolve("supabase/migrations", f), "utf8"));
    for (const id of [op, t, t2, s, peer, other])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "update public.profiles set role='teacher' where id=any($1::uuid[])",
      [[op, t, t2]],
    );
    await db.exec("update public.profiles set consent_status='verified'");
    await db.query("insert into private.operators(user_id) values($1)", [op]);
    await db.query(
      "insert into public.classrooms(id,name,teacher_id) values($1,'테스트 우리 반',$2),($3,'테스트 다른 반',$4)",
      [c, t, c2, t2],
    );
    await db.query(
      "insert into public.enrollments(classroom_id,student_id) values($1,$2),($1,$3),($4,$2),($4,$5)",
      [c, s, peer, c2, other],
    );
    await db.query(
      "insert into public.missions(id,slug,title,theme,grade_band,prompt,description,minutes) values($1,'ops-test','생각','empathy','3-4','생각','질문',10)",
      [mission],
    );
    await db.query(
      "insert into public.assignments(id,classroom_id,mission_id,mission_snapshot) values($1,$2,$3,'{}'),($4,$5,$3,'{}')",
      [a, c, mission, a2, c2],
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
  it("shows a teacher only their own roster; student cannot inspect class rosters", async () => {
    await actor(t);
    const state = (await one("select public.operations_state() v")).v;
    expect(state.classes.map((r: any) => r.id)).toEqual([c]);
    expect(state.students.map((r: any) => r.id)).not.toContain(other);
    await actor(s);
    const own = (await one("select public.operations_state() v")).v;
    expect(own.students).toHaveLength(0);
    expect(own.teachers).toHaveLength(0);
  });
  it("does not trust editable signup metadata for operator privileges", async () => {
    await owner();
    await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
      { role: "teacher", operator: true },
      s,
    ]);
    await actor(s);
    expect((await one("select public.account_session() v")).v.operator).toBe(
      false,
    );
    await denied(
      "select public.bootstrap_operator($1)",
      [s],
      "permission denied",
    );
    await denied(
      "select public.operations_command('teacher_decide',$1,$2)",
      [{ studentId: s, approve: true }, randomUUID()],
      "BF_FORBIDDEN",
    );
  });
  it("blocks cross-class password resets and direct service finalization", async () => {
    await actor(t);
    await denied(
      "select public.account_job_begin('reset_password',$1,$2,$3)",
      [{ studentId: other, classroomId: c }, randomUUID(), "a".repeat(64)],
      "BF_FORBIDDEN",
    );
    await denied(
      "select public.account_job_finish($1,$2,0,true)",
      [randomUUID(), randomUUID()],
      "permission denied",
    );
  });
  it("stores no password in the batch plan and uses stable IDs on retry", async () => {
    await actor(t);
    const key = randomUUID();
    const payload = {
      classroomId: c,
      students: [{ loginId: "forest01", name: "새싹" }],
    };
    const j = (
      await one(
        "select public.account_job_begin('create_students',$1,$2,$3) j",
        [payload, key, "a".repeat(64)],
      )
    ).j;
    expect(JSON.stringify(j)).not.toContain("password");
    await denied(
      "select public.account_job_begin('create_students',$1,$2,$3)",
      [payload, key, "b".repeat(64)],
      "BF_IDEMPOTENCY_CONFLICT",
    );
    await service();
    await db.query("select public.account_job_finish($1,$2,0,false)", [
      j.id,
      j.lease,
    ]);
    await actor(t);
    const retry = (
      await one(
        "select public.account_job_begin('create_students',$1,$2,$3) j",
        [payload, key, "a".repeat(64)],
      )
    ).j;
    expect(retry.plan).toEqual(j.plan);
    expect(retry.lease).not.toBe(j.lease);
    await service();
    await denied(
      "select public.account_job_finish($1,$2,0,true)",
      [j.id, j.lease],
      "BF_STALE_JOB",
    );
  });
  it("finalizes a provider-created account once with consent pending and first-change required", async () => {
    await actor(t);
    const key = randomUUID();
    const payload = {
      classroomId: c,
      students: [{ loginId: "forest01", name: "새싹" }],
    };
    const j = (
      await one(
        "select public.account_job_begin('create_students',$1,$2,$3) j",
        [payload, key, "a".repeat(64)],
      )
    ).j;
    const target = j.plan.items[0].id;
    await owner();
    await db.query("insert into auth.users(id) values($1)", [target]);
    await service();
    await db.query("select public.account_job_finish($1,$2,0,true)", [
      j.id,
      j.lease,
    ]);
    await db.query("select public.account_job_finish($1,$2,0,true)", [
      j.id,
      j.lease,
    ]);
    await owner();
    const p = await one("select * from public.profiles where id=$1", [target]);
    expect(p.must_change_password).toBe(true);
    expect(p.consent_status).toBe("pending");
    expect(
      (
        await db.query("select * from public.enrollments where student_id=$1", [
          target,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("makes an old signed session unusable immediately after reset", async () => {
    const old = randomUUID(),
      fresh = randomUUID();
    await owner();
    await db.query(
      "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp()-interval '1 hour')",
      [old, s],
    );
    await actor(t);
    await one("select public.account_job_begin('reset_password',$1,$2,$3)", [
      { classroomId: c, studentId: s },
      randomUUID(),
      "a".repeat(64),
    ]);
    await actor(s, old);
    expect((await one("select public.account_session() v")).v.fresh).toBe(
      false,
    );
    await denied(
      "select public.hub_command('character_save',$1,$2)",
      [{ nickname: "새싹", species: "rabbit" }, randomUUID()],
      "BF_ACCOUNT_BLOCKED",
    );
    expect(
      (await db.query("select * from public.enrollments")).rows,
    ).toHaveLength(0);
    await owner();
    await db.query(
      "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp()+interval '1 second')",
      [fresh, s],
    );
    await actor(s, fresh);
    expect((await one("select public.account_session() v")).v).toMatchObject({
      fresh: true,
      ready: false,
    });
  });
  it("accepts today's Korean consent date independently of the caller timezone and rejects tomorrow", async () => {
    await db.exec("set local timezone='Pacific/Pago_Pago'");
    const dates = await one(`select
      to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD') today,
      to_char((now() at time zone 'Asia/Seoul') + interval '1 day','YYYY-MM-DD') tomorrow`);
    await actor(t);
    const input = { studentId: s, classroomId: c, method: "paper", reference: "가상 날짜 검증" };
    await denied("select public.operations_command('consent_request',$1,$2)",
      [{ ...input, confirmedOn: dates.tomorrow }, randomUUID()], "BF_INVALID_INPUT");
    expect(await cmd("consent_request", { ...input, confirmedOn: dates.today })).toHaveProperty("id");
    expect((await one("show timezone")).TimeZone).toBe("Pacific/Pago_Pago");
  });
  it("requires operator evidence confirmation to verify consent", async () => {
    await owner();
    await db.query(
      "update public.profiles set consent_status='pending' where id=$1",
      [s],
    );
    await actor(t);
    const r = await cmd("consent_request", {
      studentId: s,
      classroomId: c,
      method: "paper",
      reference: "2026-독서-01",
      confirmedOn: new Date().toISOString().slice(0, 10),
    });
    await denied(
      "select public.operations_command('consent_decide',$1,$2)",
      [{ id: r.id, approve: true, evidenceChecked: true }, randomUUID()],
      "BF_FORBIDDEN",
    );
    await actor(op);
    await denied(
      "select public.operations_command('consent_decide',$1,$2)",
      [{ id: r.id, approve: true }, randomUUID()],
      "BF_EVIDENCE_REQUIRED",
    );
    await cmd("consent_decide", {
      id: r.id,
      approve: true,
      evidenceChecked: true,
    });
    await owner();
    expect(
      (await one("select consent_status from public.profiles where id=$1", [s]))
        .consent_status,
    ).toBe("verified");
  });
  it("withdrawal blocks own learning data and hides already-published plaza copies", async () => {
    const reading = await log();
    await owner();
    const sub = await one(
      "insert into public.submissions(assignment_id,student_id,title,body,version,request_id) values($1,$2,'제목','본문',1,$3) returning id",
      [a, s, randomUUID()],
    );
    await db.query(
      "insert into public.plaza_posts(student_id,classroom_id,submission_id,title,body,pen_name,status) values($1,$2,$3,'제목','본문','새싹','published')",
      [s, c, sub.id],
    );
    await actor(peer);
    expect(
      (await db.query("select * from public.plaza_posts")).rows,
    ).toHaveLength(1);
    await actor(s);
    await cmd("consent_withdraw", {});
    expect(
      (
        await db.query("select * from public.reading_logs where id=$1", [
          reading.id,
        ])
      ).rows,
    ).toHaveLength(0);
    await denied(
      "select public.hub_command('character_save',$1,$2)",
      [{ nickname: "새싹", species: "rabbit" }, randomUUID()],
      "BF_CONSENT_REQUIRED",
    );
    await actor(peer);
    expect(
      (await db.query("select * from public.plaza_posts")).rows,
    ).toHaveLength(0);
  });
  it("requires an approved deletion and never grants clients purge access", async () => {
    await actor(t);
    const r = await cmd("deletion_request", { studentId: s, classroomId: c });
    await denied(
      "select public.operations_purge($1)",
      [r.id],
      "permission denied",
    );
    await service();
    await denied("select public.operations_purge($1)", [r.id], "BF_FORBIDDEN");
  });
  it("purges only the selected class and subject, including immutable ledger and replay text", async () => {
    const mine = await log();
    const sameOtherClass = await log(s, c2);
    const peers = await log(peer, c);
    await owner();
    await db.query(
      "insert into public.economy_ledger(student_id,classroom_id,amount,reason,source_key) values($1,$2,5,'테스트','test'),($3,$2,7,'테스트','test')",
      [s, c, peer],
    );
    await db.query(
      "insert into public.activity_events(student_id,classroom_id,kind,source_key,xp,coins) values($1,$2,'reading','test',20,5)",
      [s, c],
    );
    const req = await approveDelete();
    await actor(op);
    expect(
      (await one("select public.deletion_preview($1) v", [req])).v,
    ).toMatchObject({ reading_logs: 1, ledger: 1, auth_account: false });
    await service();
    await db.query("select public.operations_purge($1)", [req]);
    await db.query("select public.operations_purge($1)", [req]);
    await owner();
    const logs = (
      await db.query("select id from public.reading_logs")
    ).rows.map((r: any) => r.id);
    expect(logs).toContain(sameOtherClass.id);
    expect(logs).toContain(peers.id);
    expect(logs).not.toContain(mine.id);
    expect(
      (await db.query("select * from public.economy_ledger")).rows,
    ).toHaveLength(1);
    expect(
      (
        await one(
          "select count(*)::int n from private.hub_requests where result->>'id'=$1",
          [mine.id],
        )
      ).n,
    ).toBe(0);
    expect(
      (await db.query("select * from public.profiles where id=$1", [s])).rows,
    ).toHaveLength(1);
  });
  it("keeps immutable ledgers protected outside the approved purge transaction", async () => {
    await owner();
    await db.query(
      "insert into public.economy_ledger(student_id,classroom_id,amount,reason,source_key) values($1,$2,5,'테스트','test')",
      [s, c],
    );
    await denied(
      "delete from public.economy_ledger where student_id=$1",
      [s],
      "BF_IMMUTABLE_SNAPSHOT",
    );
    await denied(
      "update public.economy_ledger set amount=7 where student_id=$1",
      [s],
      "BF_IMMUTABLE_SNAPSHOT",
    );
  });
  it("rechecks retention on execution so new learning is never purged as expired", async () => {
    await owner();
    await db.query(
      "update public.enrollments set created_at=now()-interval '100 days' where classroom_id=$1 and student_id=$2",
      [c, s],
    );
    await actor(t);
    await cmd("retention_set", { classroomId: c, days: 30 });
    const r = await cmd("deletion_request", {
      classroomId: c,
      studentId: s,
      retention: true,
    });
    await log();
    await actor(op);
    await cmd("deletion_decide", { id: r.id, approve: true, confirmed: true });
    await service();
    await denied(
      "select public.operations_purge($1)",
      [r.id],
      "BF_NOT_EXPIRED",
    );
  });
  it("requires class handover before revoking a teacher and keeps old sessions invalid on reactivation", async () => {
    await actor(op);
    await denied(
      "select public.operations_command('account_status',$1,$2)",
      [{ studentId: t, active: false }, randomUUID()],
      "BF_HANDOVER_REQUIRED",
    );
    await cmd("class_handover", { classroomId: c, teacherId: t2 });
    await cmd("account_status", { studentId: t, active: false });
    await actor(t);
    await denied(
      "select public.create_classroom('새 학급')",
      [],
      "BF_ACCOUNT_BLOCKED",
    );
    await actor(op);
    await cmd("account_status", { studentId: t, active: true });
    await actor(t);
    expect((await one("select public.account_session() v")).v.ready).toBe(
      false,
    );
  });
  it("does not let an operator suspend themselves", async () => {
    await actor(op);
    await denied(
      "select public.operations_command('account_status',$1,$2)",
      [{ studentId: op, active: false }, randomUUID()],
      "BF_FORBIDDEN",
    );
  });
  it("does not expose account status or definer behavior to anonymous API callers", async () => {
    await db.exec("reset role;set role anon");
    await denied("select public.account_session()", [], "permission denied");
    await owner();
    expect(
      (
        await one(
          "select prosecdef from pg_proc where oid='public.account_session()'::regprocedure",
        )
      ).prosecdef,
    ).toBe(false);
  });
  it("serializes password operations from two different class teachers", async () => {
    await actor(t);
    await one("select public.account_job_begin('reset_password',$1,$2,$3)", [
      { classroomId: c, studentId: s },
      randomUUID(),
      "a".repeat(64),
    ]);
    await actor(t2);
    await denied(
      "select public.account_job_begin('reset_password',$1,$2,$3)",
      [{ classroomId: c2, studentId: s }, randomUUID(), "b".repeat(64)],
      "BF_BUSY",
    );
  });
  it("lets an operator cancel an approved deletion before purging", async () => {
    await log();
    const id = await approveDelete();
    await actor(op);
    await cmd("deletion_cancel", { id });
    await service();
    await denied("select public.operations_purge($1)", [id], "BF_FORBIDDEN");
    await actor(s);
    expect(
      (await db.query("select * from public.reading_logs")).rows,
    ).toHaveLength(1);
  });
  it("does not promote issued students to teachers", async () => {
    await actor(s);
    await denied(
      "select public.operations_command('teacher_request','{}',$1)",
      [randomUUID()],
      "BF_FORBIDDEN",
    );
  });
  it("replays state commands exactly and rejects changed payloads", async () => {
    await actor(t);
    const key = randomUUID();
    const p = { classroomId: c, days: 90 };
    expect(await cmd("retention_set", p, key)).toEqual(
      await cmd("retention_set", p, key),
    );
    await denied(
      "select public.operations_command('retention_set',$1,$2)",
      [{ classroomId: c, days: 100 }, key],
      "BF_IDEMPOTENCY_CONFLICT",
    );
  });
  it("account deletion purges every class and stays retryable until Auth is deleted", async () => {
    await log();
    await log(s, c2);
    const id = await approveDelete(s, null);
    await service();
    const r = (await one("select public.operations_purge($1) v", [id])).v;
    expect(r).toMatchObject({ scope: "account", studentId: s });
    await owner();
    expect(
      (
        await db.query(
          "select * from public.reading_logs where student_id=$1",
          [s],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await one("select status from private.deletion_requests where id=$1", [
          id,
        ])
      ).status,
    ).toBe("purged");
    expect(
      (await one("select account_active from public.profiles where id=$1", [s]))
        .account_active,
    ).toBe(false);
    await db.query("delete from auth.users where id=$1", [s]);
    expect(
      (await db.query("select * from public.profiles where id=$1", [s])).rows,
    ).toHaveLength(0);
  });
});
