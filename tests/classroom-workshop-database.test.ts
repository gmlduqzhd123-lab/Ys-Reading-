import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
let db: PGlite;
const t = "10000000-0000-4000-8000-000000000001",
  t2 = "10000000-0000-4000-8000-000000000002",
  s = "20000000-0000-4000-8000-000000000001",
  peer = "20000000-0000-4000-8000-000000000002",
  outsider = "20000000-0000-4000-8000-000000000003",
  c = "30000000-0000-4000-8000-000000000001",
  c2 = "30000000-0000-4000-8000-000000000002";
async function actor(id: string) {
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
async function one(sql: string, args: unknown[] = []): Promise<any> {
  return (await db.query(sql, args)).rows[0];
}
async function command(
  name: string,
  payload: Record<string, unknown>,
  request = randomUUID(),
  cls = c,
) {
  return (
    await one("select public.classroom_tool_command($1,$2,$3,$4) v", [
      name,
      cls,
      payload,
      request,
    ])
  ).v;
}
async function state(cls = c) {
  return (await one("select public.classroom_tool_state($1) v", [cls])).v;
}
async function rejects(call: () => Promise<unknown>, code: string) {
  await db.exec("savepoint denied");
  let error: unknown;
  try {
    await call();
  } catch (e) {
    error = e;
  }
  await db.exec("rollback to denied;release savepoint denied");
  expect(String(error)).toContain(code);
}
const worksheet = {
  title: "인물에게 묻기",
  instructions: "근거를 찾아요.",
  kind: "worksheet",
  revision: 0,
  questions: [
    { id: "q1", kind: "text", label: "인물의 선택을 어떻게 생각하나요?" },
  ],
};
const quiz = {
  ...worksheet,
  title: "책숲 생각 다리",
  kind: "quiz",
  questions: [
    {
      id: "q1",
      kind: "choice",
      label: "씨앗은 무엇으로 자라나요?",
      options: ["나무", "돌"],
      answer: 0,
      explanation: "씨앗은 나무로 자랍니다.",
    },
  ],
};
async function assigned(kind = "worksheet") {
  await actor(t);
  const template = await command(
    "template_save",
    kind === "quiz" ? quiz : worksheet,
  );
  const a = await command("activity_assign", {
    template: template.id,
    revision: 1,
    confirmed: true,
    dueAt: "",
  });
  return { ...a, template: template.id };
}
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(
    "create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;",
  );
  for (const file of readdirSync(resolve("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    try {
      await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    } catch (e) {
      const d = e as {
        message: string;
        position?: string;
        internalPosition?: string;
        where?: string;
      };
      throw Error(
        file +
          ": " +
          d.message +
          " position=" +
          d.position +
          " internal=" +
          d.internalPosition +
          " " +
          d.where,
      );
    }
  }
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
it("rejects outsiders, teachers of other classes, consent withdrawal and private table access", async () => {
  await actor(outsider);
  await rejects(() => state(), "BF_FORBIDDEN");
  await actor(t2);
  await rejects(
    () => command("options_save", { mode: "both", revision: 0 }),
    "BF_FORBIDDEN",
  );
  await actor(s);
  await rejects(
    () => one("select * from private.activity_templates"),
    "permission denied",
  );
  await db.exec("reset role");
  await db.query(
    "update public.profiles set consent_status='pending' where id=$1",
    [s],
  );
  await actor(s);
  await rejects(() => state(), "BF_FORBIDDEN");
});
it("saves one daily log on retry, enforces class criteria, and rejects same-day duplication with another key", async () => {
  await actor(t);
  await command("options_save", { mode: "both", revision: 0 });
  await actor(s);
  const payload = {
      book: { title: "씨앗의 약속", author: "책숲" },
      thought: "작은 돌봄이 중요해요.",
      excerpt: "씨앗은 나무가 되었습니다.",
    },
    key = randomUUID();
  await rejects(
    () => command("daily_read", { ...payload, excerpt: "" }),
    "BF_READING_REQUIRED",
  );
  const first = await command("daily_read", payload, key);
  expect(await command("daily_read", payload, key)).toEqual(first);
  await rejects(() => command("daily_read", payload), "BF_DAILY_EXISTS");
  expect((await one("select count(*)::int n from public.reading_logs")).n).toBe(
    1,
  );
  expect(
    (await one("select count(*)::int n from public.activity_events")).n,
  ).toBe(0);
});
it("preserves assigned snapshots after template editing and rejects stale edits", async () => {
  const a = await assigned();
  await command("template_save", {
    ...worksheet,
    id: a.template,
    revision: 1,
    title: "바뀐 제목",
  });
  expect((await state()).activities[0].snapshot.title).toBe(worksheet.title);
  await rejects(
    () =>
      command("template_save", { ...worksheet, id: a.template, revision: 1 }),
    "BF_STALE",
  );
  await db.exec("reset role");
  await rejects(
    () =>
      db.query(
        "update private.class_activities set snapshot='{}' where id=$1",
        [a.id],
      ),
    "BF_SNAPSHOT_IMMUTABLE",
  );
});
it("keeps quiz answers private before submission and evaluates the immutable submitted version", async () => {
  const a = await assigned("quiz");
  await actor(s);
  const before = await state();
  expect(before.activities[0].snapshot.questions[0]).not.toHaveProperty(
    "answer",
  );
  expect(before.activities[0].snapshot.questions[0]).not.toHaveProperty(
    "explanation",
  );
  const result = await command("activity_submit", {
    id: a.id,
    version: 0,
    answers: { q1: 0 },
  });
  expect(result.score).toBe(1);
  expect(result.items[0].correct).toBe(true);
  await rejects(
    () =>
      command("activity_submit", { id: a.id, version: 1, answers: { q1: 1 } }),
    "BF_STALE",
  );
  expect(
    (await one("select count(*)::int n from public.activity_events")).n,
  ).toBe(0);
});
it("requests revision, keeps both versions, and awards an activity only once under retries", async () => {
  const a = await assigned();
  await actor(s);
  const first = await command("activity_submit", {
    id: a.id,
    version: 0,
    answers: { q1: "근거를 생각했어요." },
  });
  await actor(t);
  await command("activity_review", {
    id: first.id,
    status: "revision_requested",
    feedback: "책 속 장면을 덧붙여요.",
  });
  await actor(s);
  const second = await command("activity_submit", {
    id: a.id,
    version: 1,
    answers: { q1: "물을 주어 나무가 된 장면을 근거로 생각했어요." },
  });
  await actor(t);
  const payload = {
      id: second.id,
      status: "completed",
      feedback: "장면과 생각이 연결됐어요.",
    },
    key = randomUUID();
  await command("activity_review", payload, key);
  await command("activity_review", payload, key);
  expect(
    (
      await one(
        "select count(*)::int n from public.activity_events where kind='mission'",
      )
    ).n,
  ).toBe(1);
  expect(
    (
      await one(
        "select count(*)::int n from public.activity_events where kind='revision'",
      )
    ).n,
  ).toBe(1);
  await db.exec("reset role");
  expect(
    (await one("select count(*)::int n from private.activity_answers")).n,
  ).toBe(2);
});
it("blocks closed and overdue submissions and never sends peer work to a student", async () => {
  const a = await assigned();
  await actor(s);
  await command("activity_submit", {
    id: a.id,
    version: 0,
    answers: { q1: "나의 생각이에요." },
  });
  await actor(peer);
  expect((await state()).answers).toHaveLength(0);
  await actor(t);
  await command("activity_close", { id: a.id });
  await actor(peer);
  await rejects(
    () =>
      command("activity_submit", {
        id: a.id,
        version: 0,
        answers: { q1: "내 생각" },
      }),
    "BF_ACTIVITY_CLOSED",
  );
});
it("shares template content only, clones into the new teacher account and unpublishes safely", async () => {
  const a = await assigned();
  await rejects(
    () =>
      command("template_publish", {
        id: a.template,
        revision: 1,
        published: true,
        confirmed: false,
      }),
    "BF_CONFIRM_REQUIRED",
  );
  await command("template_publish", {
    id: a.template,
    revision: 1,
    published: true,
    confirmed: true,
  });
  await actor(t2);
  const shared = (await state(c2)).templates;
  expect(shared[0].owned).toBe(false);
  const cloned = await command(
    "template_clone",
    { id: a.template },
    randomUUID(),
    c2,
  );
  expect(cloned.id).not.toBe(a.template);
  await actor(s);
  expect((await state()).templates).toHaveLength(0);
});
it("uses existing confirmed events for collection claims and does not award extra currency", async () => {
  await actor(s);
  await rejects(
    () => command("collection_claim", { code: "seed" }),
    "BF_COLLECTION_NOT_READY",
  );
  await db.exec("reset role");
  await db.query(
    "select private.award_activity($1,$2,'reading','verified-test')",
    [s, c],
  );
  await actor(s);
  await command("collection_claim", { code: "seed" });
  await command("collection_claim", { code: "seed" });
  expect((await state()).collection).toEqual(["seed"]);
  expect(
    (await one("select count(*)::int n from public.economy_ledger")).n,
  ).toBe(1);
});
it("upserts authorized library rows and isolates searches between classes", async () => {
  await actor(t);
  const book = {
    isbn: "9788936434120",
    title: "교실의 책",
    author: "작가",
    location: "1번 책장",
    copies: 2,
  };
  await command("library_import", { books: [book] });
  await command("library_import", { books: [{ ...book, copies: 3 }] });
  await actor(s);
  expect((await state()).library[0].copies).toBe(3);
  await rejects(
    () => command("library_import", { books: [book] }),
    "BF_FORBIDDEN",
  );
  await actor(t2);
  expect((await state(c2)).library).toHaveLength(0);
});
it("enforces rhythm revision, archived class writes, and a bounded AI budget", async () => {
  await actor(s);
  await command("rhythm_save", { target: 3, revision: 0 });
  await rejects(
    () => command("rhythm_save", { target: 4, revision: 0 }),
    "BF_STALE",
  );
  await actor(t);
  for (let i = 0; i < 5; i++)
    expect(
      (await one("select public.consume_classroom_quiz_budget($1) v", [c])).v,
    ).toBe(true);
  expect(
    (await one("select public.consume_classroom_quiz_budget($1) v", [c])).v,
  ).toBe(false);
  await db.exec("reset role");
  await db.query(
    "update public.classrooms set term_state='archived' where id=$1",
    [c],
  );
  await actor(t);
  await rejects(
    () => command("options_save", { mode: "thought", revision: 0 }),
    "BF_CLASS_ARCHIVED",
  );
});
it("limits evidence to the current student or scoped teachers", async () => {
  await actor(s);
  await command("daily_read", {
    book: { title: "나의 기록" },
    thought: "나의 독서 생각",
    excerpt: "",
  });
  expect(
    (await one("select public.classroom_evidence($1,$2) v", [c, s])).v.readings,
  ).toHaveLength(1);
  await actor(peer);
  await rejects(
    () => one("select public.classroom_evidence($1,$2) v", [c, s]),
    "BF_FORBIDDEN",
  );
});
it("stores only a share hash, enforces expiry, revocation and consent at every read", async () => {
  await db.exec("reset role");
  const r = await one(
    "insert into public.term_reports(classroom_id,student_id,created_by,title,teacher_note,snapshot,version) values($1,$2,$3,'나의 성장','스스로 생각을 담았어요.','{\"works\":[]}',1) returning id",
    [c, s, t],
  );
  await db.query(
    "update public.term_reports set review_state='published',published_at=now() where id=$1",
    [r.id],
  );
  const token = "ab".repeat(32),
    hash = createHash("sha256").update(token).digest("hex");
  await actor(t);
  const share = await command("share_create", {
    report: r.id,
    tokenHash: hash,
    days: 1,
    confirmed: true,
  });
  await db.exec("reset role;set role anon");
  const view = (await one("select public.family_portfolio($1) v", [token])).v;
  expect(view.title).toBe("나의 성장");
  expect(view).not.toHaveProperty("student_id");
  await actor(t);
  expect(JSON.stringify(await state())).not.toContain(hash);
  await command("share_revoke", { id: share.id });
  await db.exec("reset role;set role anon");
  await rejects(
    () => one("select public.family_portfolio($1) v", [token]),
    "BF_SHARE_UNAVAILABLE",
  );
});
it("blocks expired shares and permanently revokes them when student consent changes", async () => {
  await db.exec("reset role");
  const report = await one(
    "insert into public.term_reports(classroom_id,student_id,created_by,title,teacher_note,snapshot,version) values($1,$2,$3,'공유 확인','기록 근거를 확인했어요.','{\"works\":[]}',1) returning id",
    [c, s, t],
  );
  await db.query(
    "update public.term_reports set review_state='published',published_at=now() where id=$1",
    [report.id],
  );
  const token = "cd".repeat(32),
    hash = createHash("sha256").update(token).digest("hex");
  await actor(t);
  const share = await command("share_create", {
    report: report.id,
    tokenHash: hash,
    days: 1,
    confirmed: true,
  });
  await db.exec("reset role");
  await db.query(
    "update private.family_shares set expires_at=now()-interval '1 second' where id=$1",
    [share.id],
  );
  await db.exec("set role anon");
  await rejects(
    () => one("select public.family_portfolio($1) v", [token]),
    "BF_SHARE_UNAVAILABLE",
  );
  await db.exec("reset role");
  await db.query(
    "update private.family_shares set expires_at=now()+interval '1 day' where id=$1",
    [share.id],
  );
  await db.query(
    "update public.profiles set consent_status='pending' where id=$1",
    [s],
  );
  await db.query(
    "update public.profiles set consent_status='verified' where id=$1",
    [s],
  );
  await db.exec("set role anon");
  await rejects(
    () => one("select public.family_portfolio($1) v", [token]),
    "BF_SHARE_UNAVAILABLE",
  );
});
it("records paper confirmation separately and never duplicates the online reward", async () => {
  const a = await assigned();
  await command("paper_confirm", {
    activity: a.id,
    student: s,
    note: "종이에서 근거와 생각을 연결한 부분을 직접 확인했습니다.",
    confirmed: true,
  });
  await actor(s);
  expect((await state()).papers).toHaveLength(1);
  const result = await command("activity_submit", {
    id: a.id,
    version: 0,
    answers: { q1: "같은 생각을 온라인에도 남겼어요." },
  });
  await actor(t);
  await command("activity_review", {
    id: result.id,
    status: "completed",
    feedback: "종이·온라인 기록을 확인했어요.",
  });
  expect(
    (
      await one(
        "select count(*)::int n from public.activity_events where kind='mission'",
      )
    ).n,
  ).toBe(1);
  await actor(peer);
  expect((await state()).papers).toHaveLength(0);
});
it("purges new activity answers, paper observations and request copies through approved deletion", async () => {
  const a = await assigned();
  await actor(s);
  await workDraft(
    "save",
    "answer",
    { classroom: c, activity: a.id, version: 0 },
    { answers: { q1: "삭제 전 나의 임시 입력" }, step: 0 },
    0,
    randomUUID(),
  );
  await command("activity_submit", {
    id: a.id,
    version: 0,
    answers: { q1: "삭제 요청할 합성 기록이에요." },
  });
  await actor(t);
  const answerId = (await state()).answers[0].id;
  await workDraft(
    "save",
    "feedback",
    { classroom: c, answer: answerId },
    { feedback: "삭제할 학생에 대한 교사의 임시 의견" },
    0,
    randomUUID(),
  );
  await command("paper_confirm", {
    activity: a.id,
    student: s,
    note: "교사의 종이 확인 기록입니다.",
    confirmed: true,
  });
  await db.exec("reset role");
  const deletion = await one(
    "insert into private.deletion_requests(student_id,classroom_id,scope,requested_by,reason,status,decided_by) values($1,$2,'class_records',$3,'request','approved',$3) returning id",
    [s, c, t],
  );
  await db.query("select public.operations_purge($1)", [deletion.id]);
  expect(
    (await one("select count(*)::int n from private.activity_answers")).n,
  ).toBe(0);
  expect(
    (await one("select count(*)::int n from private.paper_activity_checks")).n,
  ).toBe(0);
  expect(
    (
      await one(
        "select count(*)::int n from private.classroom_tool_requests where actor_id=$1",
        [s],
      )
    ).n,
  ).toBe(0);
  expect(
    (await one("select count(*)::int n from private.classroom_work_drafts")).n,
  ).toBe(0);
});
async function workshopList(
  kind: string,
  page = 1,
  filters: Record<string, unknown> = {},
  cls = c,
) {
  return (
    await one("select public.classroom_workshop_query($1,$2,$3,$4) v", [
      cls,
      kind,
      page,
      filters,
    ])
  ).v;
}
async function workDraft(
  action: string,
  scope: string,
  context: Record<string, unknown>,
  payload: unknown = null,
  revision = 0,
  request: string | null = null,
) {
  return (
    await one("select public.classroom_work_draft($1,$2,$3,$4,$5,$6) v", [
      action,
      scope,
      context,
      payload,
      revision,
      request,
    ])
  ).v;
}
it("keeps versioned workshop drafts private, replays safely and detects concurrent edits", async () => {
  const a = await assigned();
  await actor(s);
  const ctx = { classroom: c, activity: a.id, version: 0 },
    payload = { answers: { q1: "아직 제출하지 않은 생각" }, step: 0 },
    req = randomUUID();
  expect(
    (await workDraft("save", "answer", ctx, payload, 0, req)).revision,
  ).toBe(1);
  expect(
    (await workDraft("save", "answer", ctx, payload, 0, req)).revision,
  ).toBe(1);
  await rejects(
    () =>
      workDraft(
        "save",
        "answer",
        ctx,
        { answers: { q1: "다른 화면" }, step: 0 },
        0,
        randomUUID(),
      ),
    "BF_STALE_REVISION",
  );
  await actor(peer);
  expect((await workDraft("get", "answer", ctx)).payload).toBeNull();
  await actor(outsider);
  await rejects(() => workDraft("get", "answer", ctx), "BF_FORBIDDEN");
  await actor(s);
  expect((await workDraft("get", "answer", ctx)).payload).toEqual(payload);
  expect((await workshopList("answers")).items).toHaveLength(0);
  await workDraft("discard", "answer", ctx, null, 1, randomUUID());
  expect((await workDraft("get", "answer", ctx)).payload).toBeNull();
});
it("expires drafts and denies direct table access and cross-class scope claims", async () => {
  await actor(s);
  const ctx = { classroom: c };
  await workDraft(
    "save",
    "quick",
    ctx,
    { thought: "보관한 생각" },
    0,
    randomUUID(),
  );
  await rejects(
    () => one("select * from private.classroom_work_drafts"),
    "permission denied",
  );
  await rejects(() => workDraft("get", "template", ctx), "BF_FORBIDDEN");
  await rejects(
    () => workDraft("get", "quick", { classroom: c2 }),
    "BF_FORBIDDEN",
  );
  await db.exec("reset role");
  await db.exec(
    "update private.classroom_work_drafts set updated_at=now()-interval '8 days'",
  );
  await actor(s);
  expect((await workDraft("get", "quick", ctx)).revision).toBe(0);
});
it("pages beyond one hundred latest submissions without peer work or quiz secrets", async () => {
  await db.exec("reset role");
  const acts = (
    await db.query<{ id: string }>(
      "insert into private.class_activities(classroom_id,snapshot) select $1,$2::jsonb from generate_series(1,125) returning id",
      [c, JSON.stringify({ ...quiz, revision: 1 })],
    )
  ).rows;
  for (const a of acts)
    await db.query(
      "insert into private.activity_answers(activity_id,student_id,version,answers,status) values($1,$2,1,'{\"q1\":0}','submitted')",
      [a.id, s],
    );
  await actor(t);
  const first = await workshopList("answers"),
    last = await workshopList("answers", 5);
  expect(first.total).toBe(125);
  expect(first.items).toHaveLength(30);
  expect(last.items).toHaveLength(5);
  expect(first.items[0].activity_snapshot.questions[0].answer).toBe(0);
  await actor(s);
  const mine = await workshopList("answers", 1, {
    activities: acts.slice(100).map((a) => a.id),
  });
  expect(mine.total).toBe(25);
  expect(JSON.stringify(mine)).not.toContain("activity_snapshot");
  await actor(peer);
  expect((await workshopList("answers")).items).toHaveLength(0);
  await rejects(
    () => workshopList("answers", 1, { student: s }),
    "BF_FORBIDDEN",
  );
  await actor(outsider);
  await rejects(() => workshopList("answers"), "BF_FORBIDDEN");
});
it("searches all evidence with bounded pages, dates and readable choice labels", async () => {
  const a = await assigned("quiz");
  await actor(s);
  await command("activity_submit", {
    id: a.id,
    version: 0,
    answers: { q1: 0 },
  });
  const found = await workshopList("evidence", 1, {
    student: s,
    q: "나무",
    status: "answer",
  });
  expect(found.total).toBe(1);
  expect(found.items[0].body).toContain("나무");
  expect(
    (
      await workshopList("evidence", 1, {
        student: s,
        from: "2000-01-01",
        until: "2000-01-02",
      })
    ).total,
  ).toBe(0);
  await rejects(
    () => workshopList("evidence", 1, { student: peer }),
    "BF_FORBIDDEN",
  );
  await actor(t2);
  await rejects(
    () => workshopList("evidence", 1, { student: s }),
    "BF_FORBIDDEN",
  );
});
it("lists all share links and bulk revokes previous pages for the selected student only", async () => {
  await db.exec("reset role");
  const r = await one(
    "insert into public.term_reports(classroom_id,student_id,created_by,title,teacher_note,snapshot,version) values($1,$2,$3,'누적 공유','직접 확인','{\"works\":[]}',1) returning id",
    [c, s, t],
  );
  await db.query(
    "update public.term_reports set review_state='published',published_at=now() where id=$1",
    [r.id],
  );
  for (let i = 0; i < 37; i++)
    await db.query(
      "insert into private.family_shares(report_id,created_by,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",
      [
        r.id,
        t,
        createHash("sha256")
          .update("test-share-" + i)
          .digest("hex"),
      ],
    );
  await actor(t);
  const a = await workshopList("shares"),
    b = await workshopList("shares", 2);
  expect(a.total).toBe(37);
  expect(new Set([...a.items, ...b.items].map((x) => x.id)).size).toBe(37);
  expect((await workshopList("reports")).total).toBe(1);
  await rejects(
    () => command("share_revoke_student", { student: s, confirmed: false }),
    "BF_CONFIRM_REQUIRED",
  );
  const req = randomUUID();
  expect(
    (
      await command(
        "share_revoke_student",
        { student: s, confirmed: true },
        req,
      )
    ).revoked,
  ).toBe(37);
  expect(
    (
      await command(
        "share_revoke_student",
        { student: s, confirmed: true },
        req,
      )
    ).revoked,
  ).toBe(37);
  expect((await workshopList("shares", 1, { status: "active" })).total).toBe(0);
  expect((await workshopList("shares", 1, { status: "revoked" })).total).toBe(
    37,
  );
  await actor(s);
  await rejects(() => workshopList("shares"), "BF_FORBIDDEN");
  await actor(t2);
  await rejects(
    () => command("share_revoke_student", { student: s, confirmed: true }),
    "BF_FORBIDDEN",
  );
});
it("updates library rows with revision checks, protects deletions and preserves reading records", async () => {
  await actor(t);
  const b = {
    isbn: "9788936434120",
    title: "우리 교실 도서",
    author: "책숲",
    location: "1번 책장",
    copies: 2,
  };
  await command("library_import", { books: [b] });
  expect((await workshopList("library")).items[0].revision).toBe(1);
  await command("library_update", { ...b, location: "2번 책장", revision: 1 });
  expect(
    (await workshopList("library", 1, { q: "2번" })).items[0].revision,
  ).toBe(2);
  await rejects(
    () => command("library_update", { ...b, revision: 1 }),
    "BF_STALE",
  );
  await actor(s);
  await command("daily_read", {
    book: {
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      publisher: "",
      thumbnail: "",
    },
    thought: "보유 도서 목록을 삭제해도 이 독서 기록은 남아요.",
    excerpt: "",
  });
  await rejects(
    () =>
      command("library_delete", { isbn: b.isbn, revision: 2, confirmed: true }),
    "BF_FORBIDDEN",
  );
  await actor(t);
  await rejects(
    () =>
      command("library_delete", {
        isbn: b.isbn,
        revision: 2,
        confirmed: false,
      }),
    "BF_CONFIRM_REQUIRED",
  );
  await command("library_delete", {
    isbn: b.isbn,
    revision: 2,
    confirmed: true,
  });
  expect((await workshopList("library")).total).toBe(0);
  await actor(s);
  expect(
    (
      await one(
        "select count(*)::int n from public.reading_logs where student_id=$1 and book->>'isbn'=$2",
        [s, b.isbn],
      )
    ).n,
  ).toBe(1);
});
it("reopens activities with a revision and audit while preserving immutable questions and rewards", async () => {
  const a = await assigned();
  await actor(t);
  await command("activity_schedule", {
    id: a.id,
    revision: 1,
    active: false,
    dueAt: "",
    confirmed: true,
  });
  await actor(s);
  await rejects(
    () =>
      command("activity_submit", {
        id: a.id,
        version: 0,
        answers: { q1: "근거를 생각했어요." },
      }),
    "BF_ACTIVITY_CLOSED",
  );
  await actor(t);
  await rejects(
    () =>
      command("activity_schedule", {
        id: a.id,
        revision: 1,
        active: true,
        dueAt: "",
        confirmed: true,
      }),
    "BF_STALE",
  );
  await command("activity_schedule", {
    id: a.id,
    revision: 2,
    active: true,
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    confirmed: true,
  });
  await db.exec("reset role");
  expect(
    (
      await one(
        "select count(*)::integer n from private.activity_schedule_events where activity_id=$1",
        [a.id],
      )
    ).n,
  ).toBe(2);
  expect(
    (
      await one("select snapshot from private.class_activities where id=$1", [
        a.id,
      ])
    ).snapshot.title,
  ).toBe(worksheet.title);
  await actor(s);
  await command("activity_submit", {
    id: a.id,
    version: 0,
    answers: { q1: "다시 열린 활동의 근거" },
  });
  expect((await workshopList("answers")).total).toBe(1);
});
it("freezes selected classroom evidence into a reviewed report and redacts share identifiers", async () => {
  const a = await assigned();
  await actor(s);
  await command("activity_submit", {
    id: a.id,
    version: 0,
    answers: { q1: "매일 돌보는 장면이 근거예요." },
  });
  await actor(t);
  const answer = (await workshopList("answers")).items[0];
  await command("activity_review", {
    id: answer.id,
    status: "completed",
    feedback: "근거가 구체적이에요.",
  });
  const candidates = (
    await one("select public.classroom_report_candidates($1,$2) v", [c, s])
  ).v;
  expect(candidates.items).toHaveLength(1);
  const reportState = (
    await one("select public.growth_report_state($1,$2) v", [c, s])
  ).v;
  const r = (
    await one(
      "select public.create_classroom_report($1,$2,null,null,$3,$4,$5,0,$6,$7,$8) v",
      [
        c,
        s,
        [],
        "우리 반 활동 보고서",
        "직접 확인한 관찰",
        randomUUID(),
        reportState.sourceToken,
        [candidates.items[0].key],
      ],
    )
  ).v;
  const stored = await one(
    "select snapshot from public.term_reports where id=$1",
    [r.id],
  );
  expect(stored.snapshot.sources[0].body).toContain("구체적");
  await rejects(
    () =>
      one("update public.term_reports set snapshot='{}' where id=$1", [r.id]),
    "permission denied",
  );
  await one("select public.report_review_command($1,'review',1,$2)", [
    r.id,
    randomUUID(),
  ]);
  await one("select public.report_review_command($1,'publish',2,$2)", [
    r.id,
    randomUUID(),
  ]);
  const token = "be".repeat(32);
  await command("share_create", {
    report: r.id,
    days: 1,
    confirmed: true,
    tokenHash: createHash("sha256").update(token).digest("hex"),
  });
  await db.exec("reset role;set role anon");
  const view = (await one("select public.family_portfolio($1) v", [token])).v;
  expect(view.sources[0].body).toContain("돌보는");
  expect(view.sources[0]).not.toHaveProperty("key");
});
it("rejects another student evidence and stale report source tokens", async () => {
  const a = await assigned();
  await actor(s);
  await command("activity_submit", {
    id: a.id,
    version: 0,
    answers: { q1: "내 생각" },
  });
  await actor(t);
  const answer = (await workshopList("answers")).items[0];
  await command("activity_review", {
    id: answer.id,
    status: "completed",
    feedback: "확인했어요.",
  });
  const other = (
    await one("select public.growth_report_state($1,$2) v", [c, peer])
  ).v;
  await rejects(
    () =>
      one(
        "select public.create_classroom_report($1,$2,null,null,$3,$4,$5,0,$6,$7,$8)",
        [
          c,
          peer,
          [],
          "보고서",
          "관찰",
          randomUUID(),
          other.sourceToken,
          ["answer:" + answer.id],
        ],
      ),
    "BF_FORBIDDEN",
  );
  const before = (
    await one("select public.growth_report_state($1,$2) v", [c, s])
  ).v;
  await command("paper_confirm", {
    activity: a.id,
    student: s,
    note: "종이에서 확인한 새로운 근거",
    confirmed: true,
  });
  await rejects(
    () =>
      one(
        "select public.create_classroom_report($1,$2,null,null,$3,$4,$5,0,$6,$7,$8)",
        [
          c,
          s,
          [],
          "보고서",
          "관찰",
          randomUUID(),
          before.sourceToken,
          ["answer:" + answer.id],
        ],
      ),
    "BF_REPORT_SOURCE_CHANGED",
  );
});
it("rejects null workshop commands instead of routing them as a book update", async () => {
  await actor(t);
  await rejects(
    () =>
      one("select public.classroom_tool_command(null,$1,$2,$3)", [
        c,
        { title: "바꾸기", copies: 1 },
        randomUUID(),
      ]),
    "BF_INVALID_COMMAND",
  );
});
