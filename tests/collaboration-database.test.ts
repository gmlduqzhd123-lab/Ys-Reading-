import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  it,
  describe,
  expect,
} from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { runtimeDb, asUser, forbidden } from "./helpers/runtime-db";
let db: PGlite;
const owner = randomUUID(),
  reader = randomUUID(),
  reviewer = randomUUID(),
  admin = randomUUID(),
  schoolAdmin = randomUUID(),
  other = randomUUID(),
  operator = randomUUID(),
  student = randomUUID(),
  peer = randomUUID(),
  cls = randomUUID(),
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
const command = (name: string, payload: unknown, key = randomUUID()) =>
  rpc("collaboration_command", [name, payload, key]);
async function invite(who: string, permissions: string[]) {
  await asUser(db, owner);
  const r = await command("invite", {
    kind: "classroom",
    classroom: cls,
    target: who,
    permissions,
  });
  await asUser(db, who);
  await command("accept", { code: r.code });
  return r;
}
describe("scoped staff permissions and handover", () => {
  beforeAll(async () => {
    db = await runtimeDb();
    for (const id of [
      owner,
      reader,
      reviewer,
      admin,
      schoolAdmin,
      other,
      operator,
      student,
      peer,
    ])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "update public.profiles set role='teacher' where id=any($1::uuid[])",
      [[owner, reader, reviewer, admin, schoolAdmin, other, operator]],
    );
    await db.exec("update public.profiles set consent_status='verified'");
    await db.query("select public.bootstrap_operator($1)", [operator]);
    await db.query(
      "insert into public.classrooms(id,teacher_id,name) values($1,$2,'함께반'),($3,$4,'다른학교반')",
      [cls, owner, foreign, other],
    );
    await db.query(
      "insert into public.enrollments(classroom_id,student_id) values($1,$2),($3,$4)",
      [cls, student, foreign, peer],
    );
    await db.query(
      "insert into public.reading_logs(id,classroom_id,student_id,book,read_on,status,thought) values($1,$2,$3,'{\"title\":\"함께 읽기\"}','2026-11-01','completed','비공개 학생 생각')",
      [log, cls, student],
    );
  });
  afterAll(() => db.close());
  beforeEach(() => db.exec("begin"));
  afterEach(() => db.exec("rollback;reset role"));
  it("binds invitation to an approved teacher, rejects students and another recipient, expires and revokes", async () => {
    await asUser(db, owner);
    expect(
      await forbidden(db, () =>
        command("invite", {
          kind: "classroom",
          classroom: cls,
          target: student,
          permissions: ["read"],
        }),
      ),
    ).toContain("BF_TEACHER_REQUIRED");
    const r = await command("invite", {
      kind: "classroom",
      classroom: cls,
      target: reader,
      permissions: ["read"],
    });
    await asUser(db, reviewer);
    expect(
      await forbidden(db, () => command("accept", { code: r.code })),
    ).toContain("BF_INVITE_NOT_FOUND");
    await asUser(db, owner);
    await command("revoke_invitation", { id: r.id });
    await asUser(db, reader);
    expect(
      await forbidden(db, () => command("accept", { code: r.code })),
    ).toContain("BF_INVITE_NOT_FOUND");
    await asUser(db, owner);
    const expiring = await command("invite", {
      kind: "classroom",
      classroom: cls,
      target: reader,
      permissions: ["read"],
    });
    await db.exec("reset role");
    await db.query(
      "update private.staff_invitations set expires_at=now()-interval '1 minute' where id=$1",
      [expiring.id],
    );
    await asUser(db, reader);
    expect(
      await forbidden(db, () => command("accept", { code: expiring.code })),
    ).toContain("BF_INVITE_NOT_FOUND");
  });
  it("read permission cannot review, issue accounts, change economy or see another class and disappears after revocation", async () => {
    await invite(reader, ["read"]);
    expect(
      (await db.query("select thought from public.reading_logs")).rows,
    ).toHaveLength(1);
    expect(
      (await rpc("collaboration_state", [cls, 1])).classes.map(
        (x: any) => x.id,
      ),
    ).toEqual([cls]);
    expect(
      await forbidden(db, () =>
        rpc("hub_command", ["reading_verify", { id: log }, randomUUID()]),
      ),
    ).toContain("BF_FORBIDDEN");
    expect(
      await forbidden(db, () =>
        rpc("hub_command", [
          "wallet_adjust",
          { classroomId: cls, id: student, amount: 3, reason: "권한 없음" },
          randomUUID(),
        ]),
      ),
    ).toContain("BF_FORBIDDEN");
    expect(
      await forbidden(db, () =>
        rpc("account_job_begin", [
          "create_students",
          {
            classroomId: cls,
            students: [{ loginId: "staff_test", name: "새 학생" }],
          },
          randomUUID(),
          "a".repeat(64),
        ]),
      ),
    ).toContain("BF_FORBIDDEN");
    expect(
      await forbidden(db, () =>
        rpc("collaboration_records", [foreign, "reading", 1]),
      ),
    ).toContain("BF_FORBIDDEN");
    await asUser(db, owner);
    await command("revoke_staff", {
      classroom: cls,
      target: reader,
      revision: 1,
    });
    await asUser(db, reader);
    expect(
      (await db.query("select thought from public.reading_logs")).rows,
    ).toHaveLength(0);
    expect(
      await forbidden(db, () => rpc("collaboration_state", [cls, 1])),
    ).toContain("BF_FORBIDDEN");
  });
  it("allows a review delegate to verify a reading once, while denying deletion and following student consent", async () => {
    await invite(reviewer, ["review"]);
    await rpc("hub_command", ["reading_verify", { id: log }, randomUUID()]);
    await rpc("hub_command", ["reading_verify", { id: log }, randomUUID()]);
    expect(
      (
        await db.query(
          "select verified_at from public.reading_logs where id=$1",
          [log],
        )
      ).rows[0],
    ).toHaveProperty("verified_at", expect.any(Date));
    expect(
      await forbidden(db, () =>
        db.query("delete from public.reading_logs where id=$1", [log]),
      ),
    ).toContain("permission denied");
    expect(
      await forbidden(db, () =>
        rpc("hub_command", [
          "invite_create",
          { classroomId: cls },
          randomUUID(),
        ]),
      ),
    ).toContain("BF_FORBIDDEN");
    await db.exec("reset role");
    await db.query(
      "update public.profiles set consent_status='pending' where id=$1",
      [student],
    );
    await asUser(db, reviewer);
    expect(
      (await db.query("select thought from public.reading_logs")).rows,
    ).toHaveLength(0);
    expect(
      await forbidden(db, () => rpc("growth_report_state", [cls, student])),
    ).toContain("BF_FORBIDDEN");
  });
  it("student administration does not grant access to writing and can only create scoped account jobs", async () => {
    await invite(admin, ["students"]);
    expect(
      (await db.query("select id from public.reading_logs")).rows,
    ).toHaveLength(0);
    const r = await rpc("account_job_begin", [
      "create_students",
      {
        classroomId: cls,
        students: [{ loginId: "staff_issued", name: "합성 새싹" }],
      },
      randomUUID(),
      "b".repeat(64),
    ]);
    expect(r.plan.classroomId).toBe(cls);
    expect(
      await forbidden(db, () =>
        rpc("account_job_begin", [
          "create_students",
          {
            classroomId: foreign,
            students: [{ loginId: "wrong_class", name: "불가" }],
          },
          randomUUID(),
          "c".repeat(64),
        ]),
      ),
    ).toContain("BF_FORBIDDEN");
  });
  it("limits school administrators to owner-requested linked classes and reserves operator roles for recent MFA", async () => {
    await asUser(db, operator, "aal1");
    expect(
      await forbidden(db, () =>
        command("school_create", { name: "합성 학교" }),
      ),
    ).toContain("BF_MFA_REQUIRED");
    await asUser(db, operator);
    const school = (await command("school_create", { name: "합성 학교" }))
      .school;
    const inv = await command("invite", {
      kind: "school",
      school,
      target: schoolAdmin,
    });
    await asUser(db, schoolAdmin);
    await command("accept", { code: inv.code });
    expect(
      await forbidden(db, () =>
        command("school_link_accept", { classroom: cls, school }),
      ),
    ).toContain("BF_FORBIDDEN");
    await asUser(db, owner);
    await command("school_link_request", { classroom: cls, school });
    await asUser(db, schoolAdmin);
    await command("school_link_accept", { classroom: cls, school });
    const state = await rpc("collaboration_state", [cls, 1]);
    expect(state.classes.map((x: any) => x.id)).toEqual([cls]);
    expect(state.classes[0]).toMatchObject({ students: true, read: false });
    expect(
      (await db.query("select thought from public.reading_logs")).rows,
    ).toHaveLength(0);
    expect(
      await forbidden(db, () =>
        command("invite", { kind: "operator", target: reader }),
      ),
    ).toContain("BF_FORBIDDEN");
    expect(
      await forbidden(db, () => rpc("collaboration_state", [foreign, 1])),
    ).toContain("BF_FORBIDDEN");
  });
  it("requires both handover participants, removes former owner access, and protects backup operator admission", async () => {
    await invite(reader, ["read"]);
    await asUser(db, owner);
    await command("handover_propose", { classroom: cls, target: reader });
    await asUser(db, other);
    expect(
      await forbidden(db, () => command("handover_accept", { classroom: cls })),
    ).toContain("BF_FORBIDDEN");
    await asUser(db, reader);
    await command("handover_accept", { classroom: cls });
    await asUser(db, owner);
    expect(
      await forbidden(db, () => rpc("collaboration_state", [cls, 1])),
    ).toContain("BF_FORBIDDEN");
    await asUser(db, operator);
    const inv = await command("invite", { kind: "operator", target: reviewer });
    await asUser(db, reviewer, "aal1");
    expect(
      await forbidden(db, () => command("accept", { code: inv.code })),
    ).toContain("BF_MFA_REQUIRED");
    await asUser(db, reviewer);
    await command("accept", { code: inv.code });
    expect((await rpc("account_session")).operator).toBe(true);
    expect(
      await forbidden(db, () =>
        command("revoke_operator", { target: reviewer }),
      ),
    ).toContain("BF_FORBIDDEN");
    await asUser(db, operator);
    await command("revoke_operator", { target: reviewer });
    await asUser(db, reviewer);
    expect((await rpc("account_session")).operator).toBe(false);
  });
});
