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
  op = randomUUID(),
  c = randomUUID(),
  c2 = randomUUID();
describe("Paged operations workspace", () => {
  beforeAll(async () => {
    db = await runtimeDb();
    for (const id of [t, other, op])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.exec(
      "update public.profiles set role='teacher',consent_status='verified'",
    );
    await db.query("insert into private.operators(user_id) values($1)", [op]);
    await db.query(
      "insert into public.classrooms(id,teacher_id,name) values($1,$2,'가 반'),($3,$4,'나 반')",
      [c, t, c2, other],
    );
    for (let i = 0; i < 105; i++) {
      const s = randomUUID();
      await db.query("insert into auth.users(id) values($1)", [s]);
      await db.query("update public.profiles set display_name=$1 where id=$2", [
        "학생 " + String(i).padStart(3, "0"),
        s,
      ]);
      await db.query(
        "insert into public.enrollments(classroom_id,student_id) values($1,$2)",
        [c, s],
      );
    }
  });
  afterAll(() => db.close());
  beforeEach(() => db.exec("begin"));
  afterEach(() => db.exec("rollback;reset role"));
  const read = async (cls = c, f = {}) =>
    (
      await db.query<{ v: any }>(
        "select public.operations_workspace($1,$2) v",
        [cls, f],
      )
    ).rows[0].v;
  it("reads only the selected page, counts all matches and treats search literally", async () => {
    await asUser(db, t);
    const p1 = await read(),
      p2 = await read(c, { studentPage: 2 }),
      p3 = await read(c, { studentPage: 3 });
    expect(p1.totals.students).toBe(105);
    expect(p1.students).toHaveLength(50);
    expect(p2.students).toHaveLength(50);
    expect(p3.students).toHaveLength(5);
    expect(
      new Set([...p1.students, ...p2.students, ...p3.students].map((x) => x.id))
        .size,
    ).toBe(105);
    expect((await read(c, { q: "학생 104" })).students).toHaveLength(1);
    expect((await read(c, { q: "%" })).totals.students).toBe(0);
  });
  it("denies another classroom and retains a bounded compatibility endpoint", async () => {
    await asUser(db, other);
    expect(await forbidden(db, () => read())).toContain("BF_FORBIDDEN");
    await asUser(db, t);
    expect(
      (await db.query<{ v: any }>("select public.operations_state() v")).rows[0]
        .v.students,
    ).toHaveLength(50);
  });
  it("keeps operator queues independent of the current student page", async () => {
    await db.exec("reset role");
    const students = (
      await db.query<{ id: string }>(
        "select student_id id from public.enrollments where classroom_id=$1 limit 52",
        [c],
      )
    ).rows;
    for (const s of students)
      await db.query(
        "insert into private.consent_requests(student_id,classroom_id,requested_by,method,reference,confirmed_on) values($1,$2,$3,'paper','시험 근거',current_date)",
        [s.id, c, t],
      );
    await asUser(db, op);
    const one = await read(c, { studentPage: 3 }),
      two = await read(c, { consentPage: 2 });
    expect(one.totals.consents).toBe(52);
    expect(one.consents).toHaveLength(50);
    expect(two.consents).toHaveLength(2);
    expect(one.consents[0].student_name).toContain("학생");
  });
});
