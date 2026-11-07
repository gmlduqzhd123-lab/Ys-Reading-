import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { runtimeDb, asUser, forbidden } from "./helpers/runtime-db";
let db: PGlite;
const teacher = randomUUID(),
  student = randomUUID(),
  other = randomUUID(),
  cls = randomUUID();
const rpc = async (name: string, args: unknown[] = []) =>
  (
    await db.query<{ v: any }>(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) v`,
      args,
    )
  ).rows[0].v;
beforeAll(async () => {
  db = await runtimeDb();
  for (const id of [teacher, student, other])
    await db.query("insert into auth.users(id) values($1)", [id]);
  await db.query(
    "update public.profiles set consent_status='verified',role=case when id=$1 then 'teacher' else role end",
    [teacher],
  );
  await db.query(
    "insert into public.classrooms(id,teacher_id,name) values($1,$2,'완성반')",
    [cls, teacher],
  );
  await db.query(
    "insert into public.enrollments(classroom_id,student_id) values($1,$2)",
    [cls, student],
  );
});
afterAll(() => db?.close());
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback;reset role"));
it("keeps public backup metadata bounded and flags missing, failed and expired runs", async () => {
  await db.exec("set role anon");
  expect((await rpc("service_backup_health")).code).toBe("BACKUP_MISSING");
  await db.exec("reset role");
  await db.query(
    "insert into private.backup_attempts values($1,now(),now(),'failed','MCP_AUTH_REQUIRED')",
    [randomUUID()],
  );
  await db.exec("set role anon");
  const value = await rpc("service_backup_health");
  expect(value.code).toBe("BACKUP_AUTH_REQUIRED");
  expect(Object.keys(value).sort()).toEqual([
    "agentCheckedAt",
    "agentState",
    "checkedAt",
    "code",
    "healthy",
    "verifiedAt",
  ]);
});
it("fences simultaneous export jobs, source changes, another user and uncertain posting retries", async () => {
  await asUser(db, teacher);
  const key = randomUUID(),
    hash = "a".repeat(64);
  const a = await rpc("google_export_job", ["reserve", key, hash]);
  expect(
    await forbidden(db, () => rpc("google_export_job", ["reserve", key, hash])),
  ).toContain("GOOGLE_EXPORT_BUSY");
  expect(
    await forbidden(db, () =>
      rpc("google_export_job", ["reserve", key, "b".repeat(64)]),
    ),
  ).toContain("BF_IDEMPOTENCY_CONFLICT");
  await rpc("google_export_job", ["posting", key, hash, a.lease]);
  await rpc("google_export_job", ["uncertain", key, hash, a.lease]);
  const resumed = await rpc("google_export_job", ["reserve", key, hash]);
  expect(resumed.state).toBe("uncertain");
  expect(
    await forbidden(db, () =>
      rpc("google_export_job", ["posting", key, hash, resumed.lease]),
    ),
  ).toContain("GOOGLE_EXPORT_PENDING");
  await rpc("google_export_job", [
    "complete",
    key,
    hash,
    resumed.lease,
    {
      id: "file_1",
      webViewLink: "https://docs.google.com/document/d/file_1/edit",
    },
  ]);
  expect(
    (await rpc("google_export_job", ["reserve", key, hash])).result.id,
  ).toBe("file_1");
  await rpc("google_export_job", ["uncertain", key, hash, resumed.lease]);
  expect((await rpc("google_export_job", ["reserve", key, hash])).state).toBe(
    "complete",
  );
  await asUser(db, student);
  expect(
    await forbidden(db, () => rpc("google_export_job", ["reserve", key, hash])),
  ).toContain("BF_FORBIDDEN");
});
it("previews only eligible students and returns counts without learning text", async () => {
  await asUser(db, teacher);
  const v = await rpc("report_batch_preview", [cls, null, null, null]);
  expect(v.data).toHaveLength(1);
  expect(v.data[0].student).toBe(student);
  expect(v.data[0]).not.toHaveProperty("body");
  await asUser(db, other);
  expect(
    await forbidden(db, () =>
      rpc("report_batch_preview", [cls, null, null, null]),
    ),
  ).toContain("BF_FORBIDDEN");
});
it("keeps a restored service held when newer consent and deletion decisions conflict, and denies client reconciliation", async () => {
  const checkpoint = await db.query<{ v: any }>(
    "select private.operator_privacy_checkpoint() v",
  );
  checkpoint.rows[0].v.profiles.find((x: any) => x.id === student).consent =
    "pending";
  await db.exec("update private.recovery_state set held=true");
  const result = (
    await db.query<{ v: any }>(
      "select private.recovery_apply_checkpoint($1) v",
      [checkpoint.rows[0].v],
    )
  ).rows[0].v;
  expect(result.heldForReview).toBe(true);
  await asUser(db, teacher);
  expect(
    await forbidden(db, () => rpc("teacher_overview", [cls, 1])),
  ).toContain("BF_FORBIDDEN");
  expect(
    await forbidden(db, () =>
      db.query("select private.recovery_apply_checkpoint($1)", [
        checkpoint.rows[0].v,
      ]),
    ),
  ).toContain("permission denied");
});
