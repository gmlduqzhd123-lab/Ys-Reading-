import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { runtimeDb, asUser, forbidden } from "./helpers/runtime-db";
let db: PGlite;
const t = randomUUID(),
  other = randomUUID(),
  s = randomUUID(),
  c = randomUUID(),
  foreign = randomUUID(),
  mission = randomUUID(),
  assignment = randomUUID();
beforeAll(async () => {
  db = await runtimeDb();
  for (const id of [t, other, s])
    await db.query(
      "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
      [
        id,
        JSON.stringify({
          display_name: "격리 시험",
          role: id === s ? "student" : "teacher",
        }),
      ],
    );
  await db.query(
    "update public.profiles set role=case when id=$1 then 'student' else 'teacher' end,consent_status='verified'",
    [s],
  );
  await db.query(
    "insert into public.classrooms(id,name,teacher_id) values($1,'허용 반',$2),($3,'다른 반',$4)",
    [c, t, foreign, other],
  );
  await db.query(
    "insert into public.enrollments(classroom_id,student_id) values($1,$2)",
    [c, s],
  );
  await db.query(
    "insert into public.missions(id,slug,title,theme,grade_band,prompt,description,minutes) values($1,'paged-test','목록 검사','empathy','3-4','질문','설명',10)",
    [mission],
  );
  await db.query(
    "insert into public.assignments(id,classroom_id,mission_id,mission_snapshot) values($1,$2,$3,'{}')",
    [assignment, c, mission],
  );
});
afterAll(() => db?.close());
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback;reset role"));
const get = async (
  view: string,
  page = 1,
  id: string | null = null,
  status = "all",
) =>
  (
    await db.query<{ v: any }>(
      "select public.workspace_page($1,null,$2,$3,$4,1) v",
      [view, page, id, status],
    )
  ).rows[0].v;
it("aggregates Korean calendar weeks, scopes teacher access and removes withdrawn students", async () => {
  const week = (
    await db.query<{ v: string }>(
      "select to_char(date_trunc('week',now() at time zone 'Asia/Seoul'),'YYYY-MM-DD') v",
    )
  ).rows[0].v;
  await db.query(
    "insert into public.reading_logs(student_id,classroom_id,book,read_on,status,thought) values($1,$2,'{\"title\":\"격리 도서\"}',$3::date,'reading','격리 독서 생각'),($1,$2,'{\"title\":\"전주 도서\"}',$3::date-1,'reading','전주 생각')",
    [s, c, week],
  );
  await asUser(db, t);
  const getWeek = async () =>
    (
      await db.query<{ v: any }>(
        "select public.teacher_weekly_summary($1,$2::date) v",
        [c, week],
      )
    ).rows[0].v;
  const a = await getWeek();
  expect(a.days).toHaveLength(7);
  expect(a.totals.reading).toBe(1);
  expect(a.previous.reading).toBe(1);
  expect(a.totals.participants).toBe(1);
  expect(JSON.stringify(a)).not.toContain("격리 독서 생각");
  await db.exec("reset role");
  await db.query(
    "update public.profiles set consent_status='pending' where id=$1",
    [s],
  );
  await asUser(db, t);
  expect((await getWeek()).totals.reading).toBe(0);
  await asUser(db, other);
  expect(await forbidden(db, getWeek)).toContain("BF_FORBIDDEN");
  await asUser(db, s);
  expect(await forbidden(db, getWeek)).toContain("BF_FORBIDDEN");
});
it("pages authorized assignments without fetching other classes or unrelated student writing", async () => {
  await db.query(
    "insert into public.assignments(classroom_id,mission_id,mission_snapshot,created_at) select $1,$2,'{}',now()-n*interval '1 minute' from generate_series(1,35)n",
    [c, mission],
  );
  await db.query(
    "insert into public.assignments(classroom_id,mission_id,mission_snapshot) values($1,$2,'{}')",
    [foreign, mission],
  );
  await asUser(db, s);
  const a = await get("missions"),
    b = await get("missions", 2);
  expect(a.assignments).toHaveLength(30);
  expect(b.assignments).toHaveLength(6);
  expect(a.pagination.total).toBe(36);
  expect(
    new Set([...a.assignments, ...b.assignments].map((x) => x.id)).size,
  ).toBe(36);
  expect(
    [...a.assignments, ...b.assignments].every(
      (x: any) => x.classroom_id === c,
    ),
  ).toBe(true);
});
it("loads an editor beyond 10000 historical versions while always retaining the real latest version", async () => {
  await db.query(
    "insert into public.submissions(assignment_id,student_id,title,body,version,status,request_id) select $1,$2,'격리 제목','이것은 격리된 충분한 길이의 시험 글입니다.',n,'submitted',gen_random_uuid() from generate_series(1,10031)n",
    [assignment, s],
  );
  await asUser(db, s);
  const p = await get("work", 2, assignment);
  expect(p.pagination.total).toBe(10031);
  expect(p.submissions).toHaveLength(31);
  expect(p.submissions[0].version).toBe(10031);
  expect(
    p.submissions.every(
      (x: any) => x.student_id === s && x.assignment_id === assignment,
    ),
  ).toBe(true);
  expect(p.pagination.hasNext).toBe(true);
});
it("applies latest-version status before paging and rejects unauthenticated or foreign-class requests", async () => {
  await db.query(
    "insert into public.submissions(assignment_id,student_id,title,body,version,status,request_id) values($1,$2,'격리 제목','충분한 길이의 시험 글입니다.',1,'completed',gen_random_uuid()),($1,$2,'격리 제목','다시 고치는 충분한 길이의 글입니다.',2,'revision_requested',gen_random_uuid())",
    [assignment, s],
  );
  await asUser(db, t);
  expect((await get("feedback", 1, null, "completed")).pagination.total).toBe(
    0,
  );
  expect(
    (await get("feedback", 1, null, "revision_requested")).pagination.total,
  ).toBe(1);
  expect(
    await forbidden(db, () =>
      db.query("select public.workspace_page('missions',$1)", [foreign]),
    ),
  ).toContain("BF_FORBIDDEN");
  await db.exec("reset role;set role anon");
  expect(await forbidden(db, () => get("missions"))).toContain(
    "permission denied",
  );
});
