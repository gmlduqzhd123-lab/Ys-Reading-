import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
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
  other = "10000000-0000-4000-8000-000000000002",
  op = "10000000-0000-4000-8000-000000000003",
  s = "20000000-0000-4000-8000-000000000001",
  peer = "20000000-0000-4000-8000-000000000002",
  c = "30000000-0000-4000-8000-000000000001",
  a = "40000000-0000-4000-8000-000000000001",
  mission = "50000000-0000-4000-8000-000000000001";
async function one(sql: string, args: unknown[] = []): Promise<any> {
  return (await db.query(sql, args)).rows[0];
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
async function rpc(name: string, args: unknown[] = []) {
  return (
    await one(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) v`,
      args,
    )
  ).v;
}
const cmd = (
  name: string,
  payload: Record<string, unknown>,
  id = randomUUID(),
) => rpc("growth_term_command", [name, payload, id]);
const hub = (name: string, payload: Record<string, unknown>) =>
  rpc("hub_command", [name, payload, randomUUID()]);
const ops = (name: string, payload: Record<string, unknown>) =>
  rpc("operations_command", [name, payload, randomUUID()]);
async function blocked(fn: () => Promise<unknown>, message: string) {
  await db.exec("savepoint rejected");
  let error;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await db.exec("rollback to savepoint rejected;release savepoint rejected");
  expect(String(error)).toContain(message);
}
async function archive() {
  await actor(t);
  await cmd("configure", {
    classroomId: c,
    revision: 0,
    year: 2026,
    semester: 2,
    grade: 3,
  });
  await cmd("archive", { classroomId: c, revision: 1, confirmed: true });
}
async function promote() {
  await archive();
  return cmd("promote", {
    classroomId: c,
    revision: 2,
    name: "다음 반",
    year: 2027,
    semester: 1,
    grade: 4,
    students: [s],
    confirmed: true,
  });
}
async function approve(target: string) {
  await actor(t);
  const r = await ops("consent_request", {
    classroomId: target,
    studentId: s,
    method: "paper",
    reference: "가상 검증 동의",
    confirmedOn: new Date().toISOString().slice(0, 10),
  });
  await actor(op);
  await ops("consent_decide", {
    id: r.id,
    approve: true,
    evidenceChecked: true,
  });
  return r.id;
}
async function activate(target: string) {
  const st = await rpc("term_state", [target]);
  await cmd("activate", {
    classroomId: target,
    id: st.roster.find((r: any) => r.student_id === s).membership_id,
  });
}
describe("Persistent character wardrobe and archived-term progression", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz not null default clock_timestamp());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;",
    );
    for (const f of readdirSync(resolve("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync(resolve("supabase/migrations", f), "utf8"));
    for (const id of [t, other, op, s, peer])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "update public.profiles set role='teacher' where id=any($1::uuid[])",
      [[t, other, op]],
    );
    await db.exec("update public.profiles set consent_status='verified'");
    await db.query("insert into private.operators values($1,now())", [op]);
    await db.query(
      "insert into public.classrooms(id,name,teacher_id) values($1,'기존 반',$2)",
      [c, t],
    );
    await db.query(
      "insert into public.enrollments(classroom_id,student_id) values($1,$2),($1,$3)",
      [c, s, peer],
    );
    await db.query(
      "insert into private.managed_accounts(student_id,classroom_id,login_id) values($1,$2,'qa_student')",
      [s, c],
    );
    await db.query(
      "insert into public.missions(id,slug,title,theme,grade_band,prompt,description,minutes) values($1,'growth-test','성장','empathy','3-4','질문','설명',10)",
      [mission],
    );
    await db.query(
      "insert into public.assignments(id,classroom_id,mission_id,mission_snapshot) values($1,$2,$3,'{}')",
      [a, c, mission],
    );
  });
  beforeEach(() => db.exec("begin"));
  afterEach(() => db.exec("rollback;reset role"));
  afterAll(() => db?.close());
  it("rejects anonymous commands, direct equipment writes and another teacher's term data", async () => {
    await db.exec("set role anon");
    await blocked(() => rpc("growth_state"), "permission denied");
    await blocked(() => rpc("term_state"), "permission denied");
    await actor(s);
    await blocked(
      () =>
        one("insert into public.character_equipment(student_id) values($1)", [
          s,
        ]),
      "permission denied",
    );
    await blocked(() => cmd("archive", { classroomId: c }), "BF_FORBIDDEN");
    await actor(other);
    await blocked(() => rpc("term_state", [c]), "BF_FORBIDDEN");
    await blocked(
      () =>
        cmd("configure", {
          classroomId: c,
          year: 2026,
          semester: 2,
          revision: 0,
        }),
      "BF_FORBIDDEN",
    );
  });
  it("derives unlocks from real XP, checks slots, revisions and stable retries", async () => {
    await actor(s);
    expect(
      (await rpc("growth_state")).catalog.find(
        (i: any) => i.key === "round_glasses",
      ).canEquip,
    ).toBe(false);
    await blocked(
      () =>
        cmd("equip", {
          revision: 0,
          accessory: "round_glasses",
          background: "grove",
        }),
      "BF_ITEM_LOCKED",
    );
    await owner();
    await one(
      "insert into public.activity_events(student_id,classroom_id,kind,source_key,xp,coins) values($1,$2,'attendance','qa:xp',50,0)",
      [s, c],
    );
    await actor(s);
    const id = randomUUID(),
      p = { revision: 0, accessory: "round_glasses", background: "grove" };
    expect(await cmd("equip", p, id)).toEqual({ revision: 1 });
    expect(await cmd("equip", p, id)).toEqual({ revision: 1 });
    await blocked(
      () => cmd("equip", { ...p, accessory: "leaf_pin" }, id),
      "BF_IDEMPOTENCY_CONFLICT",
    );
    await blocked(() => cmd("equip", p), "BF_CHARACTER_CONFLICT");
    await blocked(
      () =>
        cmd("equip", { revision: 1, accessory: "grove", background: "grove" }),
      "BF_ITEM_LOCKED",
    );
    expect((await rpc("growth_state")).accessory).toBe("round_glasses");
    await actor(peer);
    expect((await rpc("growth_state")).accessory).toBe("leaf_pin");
    expect(
      (await db.query("select * from public.character_equipment")).rows,
    ).toHaveLength(0);
  });
  it("reserves only once, grants on fulfillment, and preserves a paid wardrobe across terms", async () => {
    await actor(t);
    const item = await cmd("decoration_shop", {
      classroomId: c,
      itemKey: "striped_scarf",
      price: 5,
      stock: 5,
    });
    await hub("wallet_adjust", {
      classroomId: c,
      id: s,
      amount: 20,
      reason: "가상 활동",
    });
    await actor(s);
    const order = await hub("shop_buy", { id: item.id });
    await blocked(
      () =>
        cmd("equip", {
          revision: 0,
          accessory: "striped_scarf",
          background: "grove",
        }),
      "BF_ITEM_LOCKED",
    );
    await blocked(() => hub("shop_buy", { id: item.id }), "BF_ITEM_OWNED");
    await actor(t);
    await hub("order_decide", { id: order.id, status: "fulfilled" });
    await hub("order_decide", { id: order.id, status: "fulfilled" });
    await actor(s);
    expect(
      (await rpc("growth_state")).catalog.find(
        (i: any) => i.key === "striped_scarf",
      ).owned,
    ).toBe(true);
    await cmd("equip", {
      revision: 0,
      accessory: "striped_scarf",
      background: "grove",
    });
    const target = (await promote()).targetClassId;
    await approve(target);
    await actor(t);
    await activate(target);
    await actor(s);
    expect((await rpc("growth_state")).accessory).toBe("striped_scarf");
    expect((await rpc("hub_summary")).balances[target] ?? 0).toBe(0);
    await owner();
    expect(
      (
        await one(
          "select count(*)::int n from public.character_wardrobe where student_id=$1",
          [s],
        )
      ).n,
    ).toBe(1);
    expect(
      (
        await one(
          "select sum(amount)::int n from public.economy_ledger where student_id=$1 and classroom_id=$2",
          [s, c],
        )
      ).n,
    ).toBe(15);
  });
  it("does not grant cancelled items and safely falls back when source evidence is purged", async () => {
    await actor(t);
    const item = await cmd("decoration_shop", {
      classroomId: c,
      itemKey: "striped_scarf",
      price: 5,
      stock: 2,
    });
    await hub("wallet_adjust", {
      classroomId: c,
      id: s,
      amount: 20,
      reason: "가상 활동",
    });
    await actor(s);
    const o = await hub("shop_buy", { id: item.id });
    await actor(t);
    await hub("order_decide", { id: o.id, status: "cancelled" });
    await actor(s);
    expect(
      (await rpc("growth_state")).catalog.find(
        (i: any) => i.key === "striped_scarf",
      ).owned,
    ).toBe(false);
    const o2 = await hub("shop_buy", { id: item.id });
    await actor(t);
    await hub("order_decide", { id: o2.id, status: "fulfilled" });
    await actor(s);
    await cmd("equip", {
      revision: 0,
      accessory: "striped_scarf",
      background: "grove",
    });
    await owner();
    await db.exec("alter table public.shop_orders disable trigger user");
    await one("delete from public.shop_orders where id=$1", [o2.id]);
    await db.exec("alter table public.shop_orders enable trigger user");
    await actor(s);
    expect((await rpc("growth_state")).accessory).toBe(null);
  });
  it("blocks closing pending reservations, then interlocks legacy mutations and preserves reads", async () => {
    await actor(s);
    await hub("reading_save", {
      classroomId: c,
      book: { title: "보관할 책" },
      readOn: "2026-01-01",
      status: "completed",
      thought: "가상 독서 기록입니다.",
    });
    await rpc("save_draft", [a, "제목", "보관할 초안입니다.", 0]);
    await actor(t);
    const item = await hub("shop_create", {
      classroomId: c,
      name: "학급 보상",
      price: 1,
      stock: 2,
      kind: "privilege",
    });
    await hub("wallet_adjust", {
      classroomId: c,
      id: s,
      amount: 5,
      reason: "가상 활동",
    });
    await actor(s);
    const order = await hub("shop_buy", { id: item.id });
    await actor(t);
    await cmd("configure", {
      classroomId: c,
      revision: 0,
      year: 2026,
      semester: 2,
    });
    await blocked(
      () => cmd("archive", { classroomId: c, revision: 1, confirmed: true }),
      "BF_PENDING_ORDERS",
    );
    await hub("order_decide", { id: order.id, status: "cancelled" });
    await cmd("archive", { classroomId: c, revision: 1, confirmed: true });
    await blocked(
      () =>
        hub("wallet_adjust", {
          classroomId: c,
          id: s,
          amount: 1,
          reason: "가상 활동",
        }),
      "BF_CLASS_ARCHIVED",
    );
    await blocked(
      () =>
        rpc("account_job_begin", [
          "create_students",
          {
            classroomId: c,
            students: [{ name: "가상 학생", loginId: "qa_01" }],
          },
          randomUUID(),
          "a".repeat(64),
        ]),
      "BF_CLASS_ARCHIVED",
    );
    await actor(s);
    await blocked(
      () => hub("attendance", { classroomId: c }),
      "BF_CLASS_ARCHIVED",
    );
    await blocked(
      () => rpc("save_draft", [a, "수정", "변경하면 안 됩니다.", 1]),
      "BF_CLASS_ARCHIVED",
    );
    await blocked(
      () =>
        rpc("submit_work", [a, "수정", "변경하면 안 됩니다.", randomUUID()]),
      "BF_CLASS_ARCHIVED",
    );
    expect(
      (await db.query("select * from public.reading_logs")).rows,
    ).toHaveLength(1);
    expect((await db.query("select * from public.drafts")).rows).toHaveLength(
      1,
    );
    await actor(t);
    expect(
      (await rpc("class_learning_archive", [c])).records.length,
    ).toBeGreaterThan(0);
    await cmd("reopen", { classroomId: c, revision: 2, confirmed: true });
    await actor(s);
    await hub("attendance", { classroomId: c });
  });
  it("requires explicit selection, later period, and revision; retry creates one target", async () => {
    await archive();
    await blocked(
      () =>
        cmd("promote", {
          classroomId: c,
          revision: 2,
          name: "다음",
          year: 2026,
          semester: 1,
          students: [s],
          confirmed: true,
        }),
      "BF_INVALID_INPUT",
    );
    await blocked(
      () =>
        cmd("promote", {
          classroomId: c,
          revision: 2,
          name: "다음",
          year: 2027,
          semester: 1,
          students: [],
          confirmed: true,
        }),
      "BF_INVALID_INPUT",
    );
    const id = randomUUID(),
      p = {
        classroomId: c,
        revision: 2,
        name: "다음",
        year: 2027,
        semester: 1,
        students: [s],
        confirmed: true,
      },
      r = await cmd("promote", p, id);
    expect(await cmd("promote", p, id)).toEqual(r);
    await blocked(
      () => cmd("promote", { ...p, revision: 3 }),
      "BF_ALREADY_PROMOTED",
    );
    await owner();
    expect((await one("select count(*)::int n from public.classrooms")).n).toBe(
      2,
    );
    expect(
      (
        await one(
          "select count(*)::int n from public.assignments where classroom_id=$1",
          [r.targetClassId],
        )
      ).n,
    ).toBe(0);
    expect(
      await one(
        "select student_id,active from public.enrollments where classroom_id=$1",
        [r.targetClassId],
      ),
    ).toMatchObject({ student_id: s, active: false });
  });
  it("requires destination-specific proof and explicit activation, even after a legacy enrollment approval", async () => {
    const target = (await promote()).targetClassId;
    await blocked(() => activate(target), "BF_TERM_CONFIRMATION");
    await owner();
    await one(
      "update public.enrollments set active=true where classroom_id=$1 and student_id=$2",
      [target, s],
    );
    await actor(s);
    expect(
      (await db.query("select * from public.classrooms where id=$1", [target]))
        .rows,
    ).toHaveLength(0);
    await blocked(
      () => hub("attendance", { classroomId: target }),
      "BF_FORBIDDEN",
    );
    expect(
      (await rpc("term_state", [target])).classes.some(
        (c: any) => c.id === target && !c.participating,
      ),
    ).toBe(true);
    await approve(target);
    await actor(t);
    await activate(target);
    await actor(s);
    expect(
      (await db.query("select * from public.classrooms where id=$1", [target]))
        .rows,
    ).toHaveLength(1);
    await hub("attendance", { classroomId: target });
    await owner();
    expect(
      (
        await one(
          "select classroom_id from private.managed_accounts where student_id=$1",
          [s],
        )
      ).classroom_id,
    ).toBe(target);
  });
  it("does not expose a peer's new class or roster to students", async () => {
    const target = (await promote()).targetClassId;
    await actor(peer);
    await blocked(() => rpc("term_state", [target]), "BF_FORBIDDEN");
    await actor(s);
    const state = await rpc("term_state", [target]);
    expect(state.roster).toEqual([]);
    expect(state.pending).toBe(null);
    expect(
      (await db.query("select * from public.promotion_memberships")).rows.every(
        (r: any) => r.student_id === s,
      ),
    ).toBe(true);
  });
  it("revokes the destination gate when its receipt is withdrawn, including later global reapproval", async () => {
    const target = (await promote()).targetClassId,
      receipt = await approve(target);
    await actor(t);
    await activate(target);
    await actor(s);
    await ops("consent_withdraw", {});
    await approve(c);
    await actor(s);
    await blocked(
      () => hub("attendance", { classroomId: target }),
      "BF_FORBIDDEN",
    );
    await owner();
    expect(
      (
        await one("select status from private.consent_requests where id=$1", [
          receipt,
        ])
      ).status,
    ).toBe("withdrawn");
  });
  it("moves reset authority with the primary class and teacher handover", async () => {
    const target = (await promote()).targetClassId;
    await approve(target);
    await actor(t);
    await activate(target);
    await actor(op);
    await ops("class_handover", { classroomId: target, teacherId: other });
    await actor(t);
    await blocked(
      () =>
        rpc("account_job_begin", [
          "reset_password",
          { classroomId: c, studentId: s },
          randomUUID(),
          "a".repeat(64),
        ]),
      "BF_FORBIDDEN",
    );
    await actor(other);
    await blocked(() => rpc("term_state", [c]), "BF_FORBIDDEN");
    const job = await rpc("account_job_begin", [
      "reset_password",
      { classroomId: target, studentId: s },
      randomUUID(),
      "b".repeat(64),
    ]);
    expect(job).toBeTruthy();
  });
  it("blocks activation while a password job holds a live lease", async () => {
    const target = (await promote()).targetClassId;
    await approve(target);
    await actor(t);
    await rpc("account_job_begin", [
      "reset_password",
      { classroomId: c, studentId: s },
      randomUUID(),
      "c".repeat(64),
    ]);
    await blocked(() => activate(target), "BF_BUSY");
  });
  it("can purge archived source records without removing a new class or its participation proof", async () => {
    const target = (await promote()).targetClassId;
    await approve(target);
    await actor(t);
    await activate(target);
    const d = await ops("deletion_request", { studentId: s, classroomId: c });
    await actor(op);
    await ops("deletion_decide", { id: d.id, approve: true, confirmed: true });
    await db.exec("reset role;set role service_role");
    await rpc("operations_purge", [d.id]);
    await owner();
    expect(
      (
        await one(
          "select classroom_id from private.managed_accounts where student_id=$1",
          [s],
        )
      ).classroom_id,
    ).toBe(target);
    expect(
      (await one("select private.promoted_ready($1,$2) ready", [target, s]))
        .ready,
    ).toBe(true);
    expect(
      (
        await one(
          "select count(*)::int n from public.enrollments where classroom_id=$1 and student_id=$2",
          [c, s],
        )
      ).n,
    ).toBe(0);
    await actor(s);
    await hub("attendance", { classroomId: target });
  });
  it("keeps the new-class gate after scoped deletion so legacy re-enrollment cannot restore proof", async () => {
    const target = (await promote()).targetClassId;
    await approve(target);
    await actor(t);
    await activate(target);
    const d = await ops("deletion_request", {
      studentId: s,
      classroomId: target,
    });
    await actor(op);
    await ops("deletion_decide", { id: d.id, approve: true, confirmed: true });
    await db.exec("reset role;set role service_role");
    await rpc("operations_purge", [d.id]);
    await owner();
    expect(
      (await one("select private.promoted_ready($1,$2) ready", [target, s]))
        .ready,
    ).toBe(false);
    expect(
      (
        await one(
          "select count(*)::int n from public.promotion_memberships where target_classroom_id=$1 and student_id=$2",
          [target, s],
        )
      ).n,
    ).toBe(1);
    const member = await one(
      "select id from public.promotion_memberships where target_classroom_id=$1 and student_id=$2",
      [target, s],
    );
    await actor(t);
    await blocked(
      () => cmd("activate", { classroomId: target, id: member.id }),
      "BF_ENROLLMENT_CLOSED",
    );
  });
});
