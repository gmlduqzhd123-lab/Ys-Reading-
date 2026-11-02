import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { runtimeDb, asUser, forbidden } from "./helpers/runtime-db";
let db: PGlite;
const op = randomUUID(),
  teacher = randomUUID(),
  student = randomUUID(),
  cls = randomUUID();
describe("Operator step-up authorization", () => {
  beforeAll(async () => {
    db = await runtimeDb();
    for (const id of [op, teacher, student])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "update public.profiles set role='teacher',consent_status='verified' where id=any($1::uuid[])",
      [[op, teacher]],
    );
    await db.query("insert into private.operators(user_id) values($1)", [op]);
    await db.query(
      "insert into public.classrooms(id,teacher_id,name) values($1,$2,'시험 학급')",
      [cls, teacher],
    );
  });
  afterAll(() => db.close());
  beforeEach(() => db.exec("begin"));
  afterEach(() => db.exec("rollback;reset role"));
  const handover = (id = randomUUID()) =>
    db.query("select public.operations_command($1,$2,$3)", [
      "class_handover",
      { classroomId: cls, teacherId: op },
      id,
    ]);
  it("requires a signed recent MFA claim and applies it before idempotent replay", async () => {
    await asUser(db, op, "aal1");
    expect(await forbidden(db, () => handover())).toContain("BF_MFA_REQUIRED");
    await asUser(db, op);
    const key = randomUUID();
    await handover(key);
    await asUser(db, op, "aal1");
    expect(await forbidden(db, () => handover(key))).toContain(
      "BF_MFA_REQUIRED",
    );
  });
  it("rejects expired and future verification times", async () => {
    await asUser(db, op);
    for (const delta of [-20 * 60, 5 * 60]) {
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: op,
          aal: "aal2",
          amr: [
            {
              method: "totp",
              timestamp: Math.floor(Date.now() / 1000) + delta,
            },
          ],
        }),
      ]);
      expect(await forbidden(db, () => handover())).toContain(
        "BF_MFA_REQUIRED",
      );
    }
  });
  it("does not convert MFA into operator authority and never accepts metadata as MFA", async () => {
    await asUser(db, teacher);
    expect(await forbidden(db, () => handover())).toContain("BF_FORBIDDEN");
    await asUser(db, student);
    expect(
      await forbidden(db, () =>
        db.query("select public.operator_security_state()"),
      ),
    ).toContain("BF_FORBIDDEN");
    await asUser(db, op, "aal1");
    await db.exec("reset role");
    await db.query(
      "update auth.users set raw_user_meta_data='{" +
        '"aal":"aal2"' +
        "}' where id=$1",
      [op],
    );
    await asUser(db, op, "aal1");
    expect(await forbidden(db, () => handover())).toContain("BF_MFA_REQUIRED");
  });
  it("also protects approved account-deletion jobs at the worker entry point", async () => {
    await asUser(db, op, "aal1");
    expect(
      await forbidden(db, () =>
        db.query("select public.account_job_begin($1,$2,$3,$4)", [
          "delete_account",
          { id: randomUUID() },
          randomUUID(),
          "a".repeat(64),
        ]),
      ),
    ).toContain("BF_MFA_REQUIRED");
  });
});
