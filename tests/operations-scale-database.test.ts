import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import {
  prepareBackup,
  verifyRestore,
} from "../scripts/lib/operator-restore.mjs";
import {
  encryptBackup,
  decryptBackup,
} from "../scripts/lib/operator-vault.mjs";
let db: PGlite;
const t = "10000000-0000-4000-8000-000000000001",
  op = "10000000-0000-4000-8000-000000000002",
  other = "10000000-0000-4000-8000-000000000003",
  s = "20000000-0000-4000-8000-000000000001",
  peer = "20000000-0000-4000-8000-000000000002",
  c = "30000000-0000-4000-8000-000000000001",
  c2 = "30000000-0000-4000-8000-000000000002",
  mission = "40000000-0000-4000-8000-000000000001",
  a = "50000000-0000-4000-8000-000000000001";
const files = readdirSync(resolve("supabase/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort()
  .map((name) => ({
    name,
    sql: readFileSync(resolve("supabase/migrations", name), "utf8"),
  }));
async function one(sql: string, args: unknown[] = []): Promise<any> {
  return (await db.query(sql, args)).rows[0];
}
async function rpc(n: string, args: unknown[] = []) {
  return (
    await one(
      `select public.${n}(${args.map((_, i) => "$" + (i + 1)).join(",")}) v`,
      args,
    )
  ).v;
}
async function actor(id: string) {
  await db.exec("reset role;set role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [
      id,
      JSON.stringify({
        sub: id,
        aal: "aal2",
        amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }],
      }),
    ],
  );
}
async function owner() {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',true)");
}
const ops = (n: string, p: Record<string, unknown>) =>
  rpc("operations_command", [n, p, randomUUID()]);
const growth = (n: string, p: Record<string, unknown>) =>
  rpc("growth_term_command", [n, p, randomUUID()]);
const scale = (n: string, p: Record<string, unknown>, id = randomUUID()) =>
  rpc("operations_scale_command", [n, p, id]);
async function denied(fn: () => Promise<unknown>, code: string) {
  await db.exec("savepoint denied");
  let error;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await db.exec("rollback to savepoint denied;release savepoint denied");
  expect(String(error)).toContain(code);
}
async function proof(target: string, student = s) {
  await actor(t);
  return ops("consent_request", {
    classroomId: target,
    studentId: student,
    method: "paper",
    reference: "가상 확인 자료",
    confirmedOn: new Date().toISOString().slice(0, 10),
  });
}
describe("Bounded learning reads, batch consent/progression and private recovery", () => {
  it("rejects null pagination and queue filters explicitly", async () => {
    await actor(t);
    await denied(
      () => rpc("review_queue_state", [c, null, 1]),
      "BF_INVALID_INPUT",
    );
    await denied(() => rpc("term_roster_page", [c, null]), "BF_INVALID_INPUT");
    await actor(s);
    await denied(() => rpc("student_today_state", [null]), "BF_INVALID_INPUT");
  });
  it("pages a large roster without dropping students and scopes it to its teacher", async () => {
    for (let i = 0; i < 51; i++) {
      const id = randomUUID();
      await one("insert into auth.users(id) values($1)", [id]);
      await one(
        "insert into public.enrollments(classroom_id,student_id) values($1,$2)",
        [c, id],
      );
    }
    await actor(t);
    const p1 = await rpc("term_roster_page", [c, 1]),
      p2 = await rpc("term_roster_page", [c, 2]);
    expect(p1).toHaveLength(50);
    expect(p2).toHaveLength(3);
    expect(new Set([...p1, ...p2].map((r: any) => r.student_id)).size).toBe(53);
    await actor(other);
    await denied(() => rpc("term_roster_page", [c, 1]), "BF_FORBIDDEN");
  });
  it("appends the next selected students to the same promotion class with revision and replay protection", async () => {
    await actor(t);
    await growth("archive", { classroomId: c, revision: 0, confirmed: true });
    const promoted = await growth("promote", {
      classroomId: c,
      revision: 1,
      name: "다음 학급",
      year: 2027,
      semester: 1,
      students: [s],
      confirmed: true,
    });
    const id = randomUUID(),
      args = [c, promoted.targetClassId, [peer], 2, id];
    expect((await rpc("append_term_students", args)).count).toBe(1);
    expect((await rpc("append_term_students", args)).count).toBe(1);
    expect(
      (await rpc("term_state", [promoted.targetClassId])).roster,
    ).toHaveLength(2);
    await denied(
      () =>
        rpc("append_term_students", [
          c,
          promoted.targetClassId,
          [s],
          2,
          randomUUID(),
        ]),
      "BF_TERM_CONFLICT",
    );
    await denied(
      () =>
        rpc("append_term_students", [
          c,
          promoted.targetClassId,
          [s],
          3,
          randomUUID(),
        ]),
      "BF_ALREADY_PROMOTED",
    );
    await actor(other);
    await denied(
      () =>
        rpc("append_term_students", [
          c,
          promoted.targetClassId,
          [peer],
          3,
          randomUUID(),
        ]),
      "BF_FORBIDDEN",
    );
  });
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}',encrypted_password text);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null default clock_timestamp());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text);",
    );
    for (const f of files) {
      await db.exec(f.sql);
      await one(
        "insert into supabase_migrations.schema_migrations values($1,$2)",
        [
          f.name.split("_")[0],
          f.name.replace(/^\d+_/, "").replace(/\.sql$/, ""),
        ],
      );
    }
    for (const id of [t, op, other, s, peer])
      await one(
        "insert into auth.users(id,encrypted_password) values($1,'qa-password-hash')",
        [id],
      );
    await one(
      "update public.profiles set role='teacher' where id=any($1::uuid[])",
      [[t, op, other]],
    );
    await db.exec("update public.profiles set consent_status='verified'");
    await one("insert into private.operators(user_id) values($1)", [op]);
    await one(
      "insert into public.classrooms(id,name,teacher_id,academic_year,semester) values($1,'우리 반',$2,2026,2),($3,'다른 반',$4,2026,2)",
      [c, t, c2, other],
    );
    await one(
      "insert into public.enrollments(classroom_id,student_id) values($1,$2),($1,$3)",
      [c, s, peer],
    );
    await one(
      "insert into public.missions(id,slug,title,theme,grade_band,prompt,description,minutes) values($1,'scale-test','함께 읽기','empathy','3-4','질문','설명',10)",
      [mission],
    );
    await one(
      'insert into public.assignments(id,classroom_id,mission_id,mission_snapshot) values($1,$2,$3,\'{"title":"함께 읽기"}\')',
      [a, c, mission],
    );
  });
  beforeEach(() => db.exec("begin"));
  afterEach(() => db.exec("rollback;reset role"));
  afterAll(() => db.close());
  it("rejects anonymous calls, teacher-only reads by students, and direct backup receipts", async () => {
    await db.exec("set role anon");
    await denied(() => rpc("review_queue_state"), "permission denied");
    await denied(() => rpc("student_today_state"), "permission denied");
    await actor(s);
    await denied(() => rpc("review_queue_state"), "BF_FORBIDDEN");
    await denied(
      () => one("select private.operator_snapshot()"),
      "permission denied",
    );
    await actor(t);
    await denied(() => rpc("operator_backup_state"), "BF_FORBIDDEN");
    await denied(
      () => one("select * from private.backup_runs"),
      "permission denied",
    );
    await denied(() => rpc("student_today_state"), "BF_FORBIDDEN");
  });
  it("paginates all pending readings with exact counts, scopes classes, and excludes archives", async () => {
    await one(
      "insert into public.reading_logs(classroom_id,student_id,book,read_on,status,thought) select $1,$2,jsonb_build_object('title','책 '||i),'2026-01-01','completed','가상 독서 생각' from generate_series(1,45)i",
      [c, s],
    );
    await actor(t);
    const first = await rpc("review_queue_state", [c, "reading", 1]),
      second = await rpc("review_queue_state", [c, "reading", 2]),
      last = await rpc("review_queue_state", [c, "reading", 3]);
    expect(first.total).toBe(45);
    expect(first.rows).toHaveLength(20);
    expect(second.rows).toHaveLength(20);
    expect(last.rows).toHaveLength(5);
    expect(
      new Set([...first.rows, ...second.rows, ...last.rows].map((r) => r.id))
        .size,
    ).toBe(45);
    await denied(
      () => rpc("review_queue_state", [c2, "reading", 1]),
      "BF_FORBIDDEN",
    );
    await growth("archive", { classroomId: c, revision: 0, confirmed: true });
    expect((await rpc("review_queue_state", [c, "reading", 1])).total).toBe(0);
    await actor(s);
    expect(
      (await db.query("select * from public.reading_logs")).rows,
    ).toHaveLength(45);
  });
  it("uses the latest writing version and returns no student body in the today list", async () => {
    await one(
      "insert into public.assignments(classroom_id,mission_id,mission_snapshot) select $1,$2,jsonb_build_object('title','할 일 '||i) from generate_series(1,10)i",
      [c, mission],
    );
    await one(
      "insert into public.submissions(assignment_id,student_id,title,body,version,request_id,status) values($1,$2,'첫 글','개인 초고 비밀',1,$3,'submitted'),($1,$2,'고친 글','개인 수정 비밀',2,$4,'revision_requested')",
      [a, s, randomUUID(), randomUUID()],
    );
    await actor(t);
    expect((await rpc("review_queue_state", [c, "writing", 1])).total).toBe(0);
    expect((await rpc("review_queue_state")).totals.revision).toBe(1);
    await actor(s);
    const page = await rpc("student_today_state", [1]);
    expect(page.tasks).toHaveLength(8);
    expect(page.total).toBe(11);
    expect(page.tasks[0].state).toBe("revision");
    expect(JSON.stringify(page)).not.toContain("개인 수정 비밀");
    expect((await rpc("student_today_state", [2])).tasks).toHaveLength(3);
    await actor(t);
    await growth("archive", { classroomId: c, revision: 0, confirmed: true });
    await actor(s);
    expect((await rpc("student_today_state")).total).toBe(0);
  });
  it("approves only explicitly checked pending evidence, with role guards and replay safety", async () => {
    const r1 = await proof(c),
      r2 = await proof(c, peer);
    await denied(
      () =>
        scale("consent_batch", { ids: [r1.id, r2.id], evidenceChecked: true }),
      "BF_FORBIDDEN",
    );
    await actor(op);
    await denied(
      () => scale("consent_batch", { ids: [r1.id, r2.id] }),
      "BF_EVIDENCE_REQUIRED",
    );
    const id = randomUUID(),
      p = { ids: [r1.id, r2.id], evidenceChecked: true };
    expect((await scale("consent_batch", p, id)).count).toBe(2);
    expect((await scale("consent_batch", p, id)).count).toBe(2);
    await denied(
      () => scale("consent_batch", { ids: [r1.id], evidenceChecked: true }, id),
      "BF_IDEMPOTENCY_CONFLICT",
    );
  });
  it("activates a selected group atomically and preserves the new-class proof gate", async () => {
    await actor(t);
    await growth("archive", { classroomId: c, revision: 0, confirmed: true });
    const p = await growth("promote", {
      classroomId: c,
      revision: 1,
      name: "다음 학급",
      year: 2027,
      semester: 1,
      students: [s, peer],
      confirmed: true,
    });
    const st = await rpc("term_state", [p.targetClassId]),
      ids = st.roster.map((r: any) => r.membership_id);
    const r1 = await proof(p.targetClassId);
    await actor(op);
    await scale("consent_batch", { ids: [r1.id], evidenceChecked: true });
    await actor(t);
    await denied(
      () => rpc("activate_term_batch", [p.targetClassId, ids, randomUUID()]),
      "BF_TERM_CONFIRMATION",
    );
    await owner();
    expect(
      (
        await one(
          "select count(*)::int n from public.enrollments where classroom_id=$1 and active",
          [p.targetClassId],
        )
      ).n,
    ).toBe(0);
    const r2 = await proof(p.targetClassId, peer);
    await actor(op);
    await scale("consent_batch", { ids: [r2.id], evidenceChecked: true });
    await actor(t);
    const id = randomUUID();
    expect(
      (await rpc("activate_term_batch", [p.targetClassId, ids, id])).count,
    ).toBe(2);
    expect(
      (await rpc("activate_term_batch", [p.targetClassId, ids, id])).count,
    ).toBe(2);
  });
  it("tracks a handover request privately and requires operator confirmation", async () => {
    await actor(t);
    const request = await scale("handover_request", {
      classroomId: c,
      note: "다음 담임 확인 요청",
    });
    await actor(other);
    expect((await rpc("operations_scale_state")).requests).toHaveLength(0);
    await denied(
      () => scale("handover_accept", { id: request.id, teacherId: other }),
      "BF_FORBIDDEN",
    );
    await actor(op);
    const id = randomUUID(),
      payload = { id: request.id, teacherId: other };
    await scale("handover_accept", payload, id);
    await scale("handover_accept", payload, id);
    await actor(t);
    expect((await rpc("operations_scale_state")).requests[0]).toMatchObject({
      status: "completed",
      current_teacher: expect.any(String),
    });
    await denied(
      () => scale("handover_request", { classroomId: c, note: "다시 요청" }),
      "BF_FORBIDDEN",
    );
  });
  it("encrypts account, permissions, records and ledger, then restores in an isolated PostgreSQL", async () => {
    await one(
      "insert into public.reading_logs(classroom_id,student_id,book,read_on,status,thought) values($1,$2,'{\"title\":\"백업 검증 책\"}','2026-01-01','completed','보존할 생각')",
      [c, s],
    );
    await actor(t);
    await rpc("hub_command", [
      "wallet_adjust",
      { classroomId: c, id: s, amount: 12, reason: "가상 보수" },
      randomUUID(),
    ]);
    await owner();
    const snapshot = (await one("select private.operator_snapshot() v")).v,
      backup = prepareBackup(snapshot, files),
      key = randomBytes(32),
      sealed = encryptBackup(backup, key);
    expect(sealed).not.toContain("보존할 생각");
    expect(sealed).not.toContain("qa-password-hash");
    const result = await verifyRestore(decryptBackup(sealed, key));
    expect(result.verified).toBe(true);
    expect(result.tables).toBeGreaterThan(50);
    expect(result.policies).toBeGreaterThan(10);
    expect(result.foreignKeys).toBeGreaterThan(20);
    await denied(() => one("select 1/0"), "division by zero");
    expect(() => decryptBackup(sealed, randomBytes(32))).toThrow(
      "BACKUP_INTEGRITY_FAILED",
    );
    const corrupt = JSON.parse(sealed);
    corrupt.data = Buffer.from("tamper").toString("base64");
    expect(() => decryptBackup(JSON.stringify(corrupt), key)).toThrow(
      "BACKUP_INTEGRITY_FAILED",
    );
  }, 20000);
});
