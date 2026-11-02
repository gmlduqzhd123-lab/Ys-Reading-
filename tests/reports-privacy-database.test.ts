import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { runtimeDb, asUser, forbidden } from "./helpers/runtime-db";
let db: PGlite;
const t = randomUUID(),
  other = randomUUID(),
  s = randomUUID(),
  peer = randomUUID(),
  c = randomUUID(),
  c2 = randomUUID(),
  a = randomUUID(),
  a2 = randomUUID(),
  m = randomUUID(),
  first = randomUUID(),
  final = randomUUID(),
  foreign = randomUUID(),
  log = randomUUID();
async function rpc(name: string, args: unknown[] = []): Promise<any> {
  return (
    await db.query<{ v: any }>(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) v`,
      args,
    )
  ).rows[0].v;
}
const create = (
  o: {
    works?: string[];
    version?: number;
    publish?: boolean;
    key?: string;
    title?: string;
    confirmed?: boolean;
  } = {},
) =>
  rpc("create_growth_report", [
    c,
    s,
    "2026-01-01",
    "2026-12-31",
    o.works ?? [final],
    o.title ?? "성장 기록",
    "원문을 읽고 남긴 관찰",
    o.publish ?? true,
    o.confirmed ?? true,
    o.version ?? 0,
    o.key ?? randomUUID(),
  ]);
describe("Reviewed reports and privacy operations", () => {
  beforeAll(async () => {
    db = await runtimeDb();
    for (const id of [t, other, s, peer])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "update public.profiles set role='teacher' where id=any($1::uuid[])",
      [[t, other]],
    );
    await db.exec("update public.profiles set consent_status='verified'");
    await db.query(
      "insert into public.classrooms(id,teacher_id,name) values($1,$2,'보고서 반'),($3,$4,'다른 반')",
      [c, t, c2, other],
    );
    await db.query(
      "insert into public.enrollments(classroom_id,student_id) values($1,$2),($3,$4)",
      [c, s, c2, peer],
    );
    await db.query(
      "insert into public.missions(id,slug,title,theme,grade_band,prompt,description,minutes) values($1,'report-test','생각','empathy','3-4','질문','설명',10)",
      [m],
    );
    await db.query(
      "insert into public.assignments(id,classroom_id,mission_id,mission_snapshot) select x.id,x.cls,m.id,to_jsonb(m) from public.missions m cross join(values($1::uuid,$2::uuid),($3::uuid,$4::uuid))x(id,cls) where m.id=$5",
      [a, c, a2, c2, m],
    );
    for (const [
      id,
      assignment,
      student,
      version,
      status,
      title,
      body,
      date,
    ] of [
      [
        first,
        a,
        s,
        1,
        "revision_requested",
        "처음 생각",
        "처음 쓴 문장",
        "2026-03-01",
      ],
      [
        final,
        a,
        s,
        2,
        "completed",
        "다시 생각",
        "근거를 더한 문장",
        "2026-03-02",
      ],
      [
        foreign,
        a2,
        peer,
        1,
        "completed",
        "다른 반",
        "보여 주면 안 되는 글",
        "2026-03-02",
      ],
    ])
      await db.query(
        "insert into public.submissions(id,assignment_id,student_id,version,status,title,body,created_at,request_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          assignment,
          student,
          version,
          status,
          title,
          body,
          date,
          randomUUID(),
        ],
      );
    for (let i = 0; i < 3; i++)
      await db.query(
        "insert into public.reading_logs(id,classroom_id,student_id,book,read_on,status,thought) values($1,$2,$3,$4,$5,'completed','책을 읽고 생각했어요')",
        [
          i === 0 ? log : randomUUID(),
          c,
          s,
          { title: "같은 책", author: "같은 저자", isbn: "1234567890" },
          i === 2 ? "2025-03-01" : "2026-03-01",
        ],
      );
    await db.query(
      "insert into public.activity_events(student_id,classroom_id,kind,source_key,xp,coins,created_at) values($1,$2,'attendance','one',5,0,'2026-03-02T01:00:00Z'),($1,$2,'attendance','two',5,0,'2026-03-02T02:00:00Z')",
      [s, c],
    );
  });
  afterAll(() => db.close());
  beforeEach(() => db.exec("begin"));
  afterEach(() => db.exec("rollback;reset role"));
  it("scopes counts to class and period without duplicate books or activity days", async () => {
    await asUser(db, t);
    const v = await rpc("growth_report_state", [
      c,
      s,
      "2026-01-01",
      "2026-12-31",
      1,
    ]);
    expect(v.counts).toMatchObject({
      readingLogs: 2,
      completedBooks: 1,
      completedMissions: 1,
      resubmissions: 1,
      xp: 10,
      attendanceDays: 1,
    });
    expect(v.works.map((x: any) => x.id)).toEqual([final]);
    expect(
      await forbidden(db, () => rpc("growth_report_state", [c2, peer])),
    ).toContain("BF_FORBIDDEN");
  });
  it("requires teacher review and preserves immutable, versioned first and final work snapshots", async () => {
    await asUser(db, t);
    expect(await forbidden(db, () => create({ confirmed: false }))).toContain(
      "BF_INVALID_INPUT",
    );
    const key = randomUUID(),
      r = await create({ key });
    expect(await create({ key })).toEqual(r);
    expect(await forbidden(db, () => create({ key, title: "변조" }))).toContain(
      "BF_IDEMPOTENCY_CONFLICT",
    );
    expect(await forbidden(db, () => create())).toContain("BF_REPORT_CONFLICT");
    const snapshot = (
      await db.query<{ snapshot: any }>(
        "select snapshot from public.term_reports where id=$1",
        [r.id],
      )
    ).rows[0].snapshot;
    expect(snapshot.works[0]).toMatchObject({
      firstBody: "처음 쓴 문장",
      body: "근거를 더한 문장",
    });
    expect(
      await forbidden(db, () => create({ works: [foreign], version: 1 })),
    ).toContain("BF_FORBIDDEN");
    await db.exec("reset role");
    expect(
      await forbidden(db, () =>
        db.query("update public.term_reports set snapshot='{}' where id=$1", [
          r.id,
        ]),
      ),
    ).toContain("BF_REPORT_IMMUTABLE");
    await asUser(db, t);
    expect((await create({ version: 1, publish: false })).version).toBe(2);
    await asUser(db, s);
    expect(
      (await db.query("select id from public.term_reports")).rows,
    ).toHaveLength(1);
    await asUser(db, peer);
    expect(
      (await db.query("select id from public.term_reports")).rows,
    ).toHaveLength(0);
  });
  it("blocks published report access after withdrawal", async () => {
    await asUser(db, t);
    const r = await create();
    await db.exec("reset role");
    await db.query(
      "update public.profiles set consent_status='pending' where id=$1",
      [s],
    );
    await asUser(db, s);
    expect(
      (await db.query("select id from public.term_reports")).rows,
    ).toHaveLength(0);
    expect(
      await forbidden(db, () =>
        rpc("register_export_receipt", [
          "growth",
          [r.id],
          "docx",
          "기록",
          null,
          randomUUID(),
        ]),
      ),
    ).toContain("BF_FORBIDDEN");
  });
  it("limits receipts to visible sources and protects private inventory revisions", async () => {
    await asUser(db, t);
    const key = randomUUID(),
      args = ["reading", [log], "docx", "독서 사본", null, key],
      id = await rpc("register_export_receipt", args);
    expect(await rpc("register_export_receipt", args)).toBe(id);
    expect(
      await forbidden(db, () =>
        rpc("register_export_receipt", [
          "reading",
          [log],
          "docx",
          "다른 제목",
          null,
          key,
        ]),
      ),
    ).toContain("BF_IDEMPOTENCY_CONFLICT");
    await rpc("update_export_receipt", [
      id,
      0,
      "retained",
      "2027-03-01",
      "보관 위치 확인",
    ]);
    expect(
      await forbidden(db, () =>
        rpc("update_export_receipt", [id, 0, "removed", null, ""]),
      ),
    ).toContain("BF_RECEIPT_CONFLICT");
    await asUser(db, other);
    expect(
      (await db.query("select id from public.export_receipts")).rows,
    ).toHaveLength(0);
    expect(
      await forbidden(db, () => rpc("register_export_receipt", args)),
    ).toContain("BF_FORBIDDEN");
  });
  it("requires policy evidence, confirmation, idempotency and class ownership", async () => {
    await asUser(db, t);
    const key = randomUUID(),
      args = [c, 365, "학교 보관 정책 확인", true, key];
    expect(
      await forbidden(db, () =>
        rpc("review_privacy_policy", [c, 365, "근거", false, key]),
      ),
    ).toContain("BF_CONFIRM_REQUIRED");
    await rpc("review_privacy_policy", args);
    await rpc("review_privacy_policy", args);
    expect((await rpc("privacy_policy_state"))[0]).toMatchObject({
      current_review: true,
      retention_days: 365,
      note: "학교 보관 정책 확인",
    });
    expect(
      await forbidden(db, () =>
        rpc("review_privacy_policy", [
          c,
          400,
          "학교 보관 정책 확인",
          true,
          key,
        ]),
      ),
    ).toContain("BF_IDEMPOTENCY_CONFLICT");
    await asUser(db, other);
    expect(
      await forbidden(db, () =>
        rpc("review_privacy_policy", [c, 365, "다른 반", true, randomUUID()]),
      ),
    ).toContain("row-level security");
  });
});
