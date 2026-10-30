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
describe("Learning hub: tenant boundaries, immutable rewards and transactions", () => {
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
  it("keeps unverified reading private across students and classes", async () => {
    const log = await reading();
    await actor(peer);
    expect(
      (await db.query("select * from public.reading_logs")).rows,
    ).toHaveLength(0);
    await actor(t2);
    expect(
      (await db.query("select * from public.reading_logs")).rows,
    ).toHaveLength(0);
    await denied("reading_verify", { id: log.id }, "BF_FORBIDDEN");
    await actor(s);
    await denied(
      "reading_save",
      {
        classroomId: c2,
        book: { title: "다른 반" },
        readOn: "2026-01-01",
        status: "completed",
        thought: "내 글",
      },
      "BF_FORBIDDEN",
    );
  });
  it("detects stale reading edits and freezes verified records without duplicate rewards", async () => {
    const log = await reading();
    await denied(
      "reading_save",
      {
        ...log,
        id: log.id,
        classroomId: c,
        readOn: "2026-01-01",
        book: { title: "책" },
        status: "completed",
        thought: "달라진 글",
        revision: 0,
      },
      "BF_DRAFT_CONFLICT",
    );
    await actor(t);
    await command("reading_verify", { id: log.id });
    await command("reading_verify", { id: log.id });
    expect(
      (await db.query("select * from public.activity_events")).rows,
    ).toHaveLength(1);
    expect(
      (await one("select sum(amount)::integer n from public.economy_ledger")).n,
    ).toBe(5);
    await actor(s);
    await denied(
      "reading_save",
      {
        id: log.id,
        classroomId: c,
        readOn: "2026-01-01",
        book: { title: "책" },
        status: "completed",
        thought: "바뀐 글",
        revision: 1,
      },
      "BF_VERIFIED_IMMUTABLE",
    );
  });
  it("awards attendance once per Korean calendar day even with different request IDs", async () => {
    await actor(s);
    await command("attendance", { classroomId: c });
    await command("attendance", { classroomId: c });
    expect(
      (
        await db.query(
          "select * from public.activity_events where kind='attendance'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.economy_ledger")).rows,
    ).toHaveLength(0);
  });
  it("blocks reward forgery and mismatched request replays", async () => {
    await actor(t);
    const key = randomUUID();
    await command(
      "wallet_adjust",
      { classroomId: c, id: s, amount: 30, reason: "독서 활동 보상" },
      key,
    );
    await command(
      "wallet_adjust",
      { classroomId: c, id: s, amount: 30, reason: "독서 활동 보상" },
      key,
    );
    await denied(
      "wallet_adjust",
      { classroomId: c, id: s, amount: 3000, reason: "다른 내용" },
      "BF_IDEMPOTENCY_CONFLICT",
      key,
    );
    await actor(s);
    await denied(
      "wallet_adjust",
      { classroomId: c, id: s, amount: 3000, reason: "위조 요청" },
      "BF_FORBIDDEN",
    );
    await db.exec("savepoint direct_write");
    await expect(
      db.exec(
        "insert into public.activity_events(student_id,classroom_id,kind,source_key,xp,coins) values('" +
          s +
          "','" +
          c +
          "','reading','fake',1000,100)",
      ),
    ).rejects.toThrow("permission denied");
    await db.exec("rollback to savepoint direct_write");
  });
  it("reserves stock, deducts once, and refunds a cancelled order exactly once", async () => {
    await actor(t);
    const item = await command("shop_create", {
      classroomId: c,
      name: "숲 장식",
      price: 10,
      stock: 1,
      kind: "decoration",
    });
    await actor(s);
    await denied("shop_buy", { id: item.id }, "BF_INSUFFICIENT_BALANCE");
    await actor(t);
    await command("wallet_adjust", {
      classroomId: c,
      id: s,
      amount: 30,
      reason: "교실 활동 보상",
    });
    await actor(s);
    const key = randomUUID();
    const order = await command("shop_buy", { id: item.id }, key);
    await command("shop_buy", { id: item.id }, key);
    expect(
      (await one("select sum(amount)::integer n from public.economy_ledger")).n,
    ).toBe(20);
    await actor(peer);
    await denied("shop_buy", { id: item.id }, "BF_SHOP_UNAVAILABLE");
    await actor(t);
    await command("order_decide", { id: order.id, status: "cancelled" });
    await command("order_decide", { id: order.id, status: "cancelled" });
    expect(
      (await one("select sum(amount)::integer n from public.economy_ledger")).n,
    ).toBe(30);
    expect(
      (await one("select stock from public.shop_items where id=$1", [item.id]))
        .stock,
    ).toBe(1);
  });
  it("requires student sharing choice and teacher approval, and preserves the selected snapshot", async () => {
    const sub = await completed();
    await actor(s);
    await denied("plaza_share", { id: sub.id }, "BF_EXPLICIT_SHARE_REQUIRED");
    const post = await command("plaza_share", { id: sub.id, consent: true });
    await actor(peer);
    expect(
      (await db.query("select * from public.plaza_posts")).rows,
    ).toHaveLength(0);
    await actor(t);
    await command("plaza_moderate", { id: post.id, status: "published" });
    await actor(peer);
    expect(
      (await one("select body from public.plaza_posts where id=$1", [post.id]))
        .body,
    ).toBe(sub.body);
    await actor(outsider);
    expect(
      (await db.query("select * from public.plaza_posts")).rows,
    ).toHaveLength(0);
    await actor(s);
    await command("plaza_moderate", { id: post.id, status: "withdrawn" });
    await actor(peer);
    expect(
      (await db.query("select * from public.plaza_posts")).rows,
    ).toHaveLength(0);
  });
  it("opens grade sharing only after both teachers connect their classes", async () => {
    await actor(t);
    const group = await command("group_create", {
      classroomId: c,
      name: "우리 학년",
    });
    await actor(t2);
    await command("group_join", { classroomId: c2, code: group.join_code });
    expect(
      (await db.query("select id,name from public.grade_groups")).rows,
    ).toHaveLength(0);
    await actor(t);
    await command("group_approve", { groupId: group.id, classroomId: c2 });
    const sub = await completed();
    await actor(s);
    const post = await command("plaza_share", {
      id: sub.id,
      groupId: group.id,
      consent: true,
    });
    await actor(t);
    await command("plaza_moderate", { id: post.id, status: "published" });
    await actor(outsider);
    expect(
      (await db.query("select * from public.plaza_posts")).rows,
    ).toHaveLength(1);
  });
  it("allows approved grade classmates to submit their own completed work to a shared activity", async () => {
    await actor(t2);
    const group = await command("group_create", {
      classroomId: c2,
      name: "함께 쓰는 학년",
    });
    await actor(t);
    await command("group_join", { classroomId: c, code: group.join_code });
    await actor(t2);
    await command("group_approve", { groupId: group.id, classroomId: c });
    const festival = await command("festival_create", {
      classroomId: c2,
      groupId: group.id,
      title: "학년 글 나눔",
      description: "완성한 생각을 나눠요",
      opensAt: "2025-01-01T00:00:00Z",
      closesAt: "2099-01-01T00:00:00Z",
    });
    const sub = await completed();
    await actor(s);
    await one("select * from public.enter_contest($1,$2,$3)", [
      festival.id,
      sub.id,
      randomUUID(),
    ]);
    expect(
      (
        await db.query(
          "select * from public.activity_events where kind='festival'",
        )
      ).rows,
    ).toHaveLength(1);
    await actor(t);
    expect((await db.query("select * from public.entries")).rows).toHaveLength(
      1,
    );
  });
  it("awards tied monthly winners once and prevents future-period awards", async () => {
    await actor(s);
    await command("attendance", { classroomId: c });
    await actor(peer);
    await command("attendance", { classroomId: c });
    await actor(t);
    const period = (
      await one("select to_char(now() at time zone 'Asia/Seoul','YYYY-MM') p")
    ).p;
    await command("monthly_awards", { classroomId: c, period });
    await command("monthly_awards", { classroomId: c, period });
    expect(
      (
        await db.query(
          "select * from public.achievement_badges where code='attendance_king'",
        )
      ).rows,
    ).toHaveLength(2);
    await denied(
      "monthly_awards",
      { classroomId: c, period: "9999-01" },
      "BF_INVALID_INPUT",
    );
  });
  it("requires verified participation for new records and purchases", async () => {
    await db.query(
      "update public.profiles set consent_status='pending' where id=$1",
      [s],
    );
    await actor(s);
    await denied("attendance", { classroomId: c }, "BF_CONSENT_REQUIRED");
    await denied("shop_buy", { id: randomUUID() }, "BF_CONSENT_REQUIRED");
  });
  it("stops sharing a published work after author consent is withdrawn", async () => {
    const sub = await completed();
    await actor(s);
    const post = await command("plaza_share", { id: sub.id, consent: true });
    await actor(t);
    await command("plaza_moderate", { id: post.id, status: "published" });
    await db.exec("reset role");
    await db.query(
      "update public.profiles set consent_status='pending' where id=$1",
      [s],
    );
    await actor(peer);
    expect(
      (await db.query("select * from public.plaza_posts")).rows,
    ).toHaveLength(0);
  });
  it("reports full wallet totals to the class teacher without exposing peer balances to students", async () => {
    await actor(t);
    await command("wallet_adjust", {
      classroomId: c,
      id: s,
      amount: 42,
      reason: "시험 지급",
    });
    const teacherSummary = (await one("select public.hub_summary() value"))
      .value;
    expect(teacherSummary.studentBalances[0].balance).toBe(42);
    await actor(peer);
    const summary = (await one("select public.hub_summary() value")).value;
    expect(summary.studentBalances).toEqual([]);
    expect(summary.balances).toEqual({});
  });
  it("counts the last Korean calendar day of a month and excludes the next month", async () => {
    await db.query(
      `insert into public.activity_events(student_id,classroom_id,kind,source_key,xp,coins,created_at) values
  ($1,$2,'attendance','last-march',5,0,'2026-03-31T14:59:59Z'),($1,$2,'attendance','first-april',5,0,'2026-03-31T15:00:00Z')`,
      [s, c],
    );
    await actor(t);
    await command("monthly_awards", { classroomId: c, period: "2026-03" });
    expect(
      (
        await one(
          "select evidence_count from public.achievement_badges where code='attendance_king'",
        )
      ).evidence_count,
    ).toBe(1);
  });
  it("records attendance per enrolled classroom and preserves earned XP after a class is paused", async () => {
    await db.query(
      "insert into public.enrollments(classroom_id,student_id) values($1,$2)",
      [c2, s],
    );
    await actor(s);
    await command("attendance", { classroomId: c });
    await command("attendance", { classroomId: c2 });
    await command("attendance", { classroomId: c });
    expect((await one("select public.hub_summary() value")).value.xp).toBe(10);
    await db.exec("reset role");
    await db.query(
      "update public.enrollments set active=false where student_id=$1",
      [s],
    );
    await actor(s);
    expect((await one("select public.hub_summary() value")).value.xp).toBe(10);
  });
});
