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
import { mayRecoverUnfinishedAccount } from "../supabase/functions/_shared/account-worker";
let db: PGlite;
const t = randomUUID(),
  other = randomUUID(),
  c = randomUUID();
describe("Issuance recovery after losing browser state", () => {
  beforeAll(async () => {
    db = await runtimeDb();
    for (const id of [t, other])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.exec(
      "update public.profiles set role='teacher',consent_status='verified'",
    );
    await db.query(
      "insert into public.classrooms(id,teacher_id,name) values($1,$2,'재개 시험 반')",
      [c, t],
    );
  });
  afterAll(() => db.close());
  beforeEach(() => db.exec("begin"));
  afterEach(() => db.exec("rollback;reset role"));
  const plan = {
    classroomId: c,
    students: [
      { loginId: "resume01", name: "새싹" },
      { loginId: "resume02", name: "나무" },
    ],
  };
  const rpc = async (n: string, args: any[]) =>
    (
      await db.query<{ v: any }>(
        `select public.${n}(${args.map((_, i) => "$" + (i + 1)).join(",")}) v`,
        args,
      )
    ).rows[0].v;
  it("resumes the original IDs while retaining completed results and requiring a released lease", async () => {
    await asUser(db, t);
    const id = randomUUID(),
      job = await rpc("account_job_begin", [
        "create_students",
        plan,
        id,
        "a".repeat(64),
      ]);
    expect(
      await forbidden(db, () =>
        rpc("resume_issuance_job", [plan, id, "b".repeat(64)]),
      ),
    ).toContain("BF_BUSY");
    await db.exec("reset role");
    await db.query("insert into auth.users(id) values($1)", [
      job.plan.items[0].id,
    ]);
    await db.exec("set role service_role");
    await rpc("account_job_finish", [job.id, job.lease, 0, true]);
    await db.exec("reset role");
    await db.query(
      "update private.account_jobs set lease_until=now()-interval '1 second' where id=$1",
      [job.id],
    );
    await asUser(db, t);
    const listing = await rpc("issuance_jobs", [c, 1]);
    expect(listing.jobs[0]).toMatchObject({ completed: 1, done: false });
    expect(listing.jobs[0].students.map((x: any) => x.completed)).toEqual([
      true,
      false,
    ]);
    expect(JSON.stringify(listing)).not.toContain("fingerprint");
    const resumed = await rpc("resume_issuance_job", [
      plan,
      id,
      "b".repeat(64),
    ]);
    expect(resumed.plan).toEqual(job.plan);
    expect(resumed.results["0"]).toBe("done");
    expect(resumed.lease).not.toBe(job.lease);
  });
  it("rejects changed identities and another teacher even if the request ID is known", async () => {
    await asUser(db, t);
    const id = randomUUID(),
      job = await rpc("account_job_begin", [
        "create_students",
        plan,
        id,
        "a".repeat(64),
      ]);
    await db.exec("reset role");
    await db.query(
      "update private.account_jobs set lease_until=now()-interval '1 second' where id=$1",
      [job.id],
    );
    await asUser(db, t);
    expect(
      await forbidden(db, () =>
        rpc("resume_issuance_job", [
          { ...plan, students: plan.students.slice(0, 1) },
          id,
          "b".repeat(64),
        ]),
      ),
    ).toContain("BF_IDEMPOTENCY_CONFLICT");
    await asUser(db, other);
    expect(await forbidden(db, () => rpc("issuance_jobs", [c, 1]))).toContain(
      "BF_FORBIDDEN",
    );
    expect(
      await forbidden(db, () =>
        rpc("resume_issuance_job", [plan, id, "b".repeat(64)]),
      ),
    ).toContain("BF_NOT_FOUND");
  });
  it("never reclaims a student-owned or stopped account", () => {
    const valid = {
      role: "student",
      account_active: true,
      consent_status: "pending",
      security_cutoff: null,
    };
    expect(mayRecoverUnfinishedAccount(valid)).toBe(true);
    for (const p of [
      null,
      { ...valid, role: "teacher" },
      { ...valid, account_active: false },
      { ...valid, consent_status: "verified" },
      { ...valid, security_cutoff: new Date().toISOString() },
    ])
      expect(mayRecoverUnfinishedAccount(p)).toBe(false);
  });
});
