import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { runtimeDb, forbidden } from "./helpers/runtime-db";
let db: PGlite;
const id = randomUUID(),
  token = "bfm1_" + randomBytes(32).toString("hex"),
  hash = (v: string) => createHash("sha256").update(v).digest();
beforeAll(async () => {
  db = await runtimeDb();
  await db.query(
    "insert into private.backup_machine_credentials(id,label,token_hash) values($1,'isolated test',$2)",
    [id, hash(token)],
  );
});
afterAll(() => db?.close());
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback;reset role"));
const send = async (
  op: string,
  payload: unknown = {},
  secret: string | null = token,
  project = "rbtqtkjnqtcnljvabisa",
) =>
  (
    await db.query<{ v: any }>(
      "select public.backup_machine_request($1,$2,$3,$4,$5::jsonb) v",
      [project, id, secret, op, JSON.stringify(payload)],
    )
  ).rows[0].v;
it("denies missing, foreign, reporting-only and revoked credentials without exposing private data", async () => {
  await db.exec("set role anon");
  for (const [op, p, s] of [
    ["health", {}, null],
    ["health", {}, "bfm1_" + "0".repeat(64)],
    ["execute_sql", { query: "select 1" }, token],
  ] as const)
    expect(await forbidden(db, () => send(op, p, s))).toContain("BF_FORBIDDEN");
  expect(
    await forbidden(db, () => send("health", {}, token, "another-project")),
  ).toContain("BF_FORBIDDEN");
  expect(
    await forbidden(db, () =>
      db.exec("select * from private.backup_machine_credentials"),
    ),
  ).toContain("permission denied");
  await db.exec("reset role");
  await db.query(
    "update private.backup_machine_credentials set active=false where id=$1",
    [id],
  );
  await db.exec("set role anon");
  expect(await forbidden(db, () => send("health"))).toContain("BF_FORBIDDEN");
});
it("limits the capability to fixed backup operations and keeps reusable secrets out of snapshots", async () => {
  await db.exec("set role anon");
  expect(await send("health")).toMatchObject({
    protocol: 1,
    mode: "machine",
    projectRef: "rbtqtkjnqtcnljvabisa",
  });
  expect(
    await forbidden(db, () => send("snapshot", { query: "delete" })),
  ).toContain("BF_INVALID_INPUT");
  const snapshot = await send("snapshot");
  expect(snapshot.format).toBe("bookforest-instance-snapshot");
  expect(JSON.stringify(snapshot)).not.toContain(token);
  expect(snapshot.data["private.backup_machine_credentials"]).toHaveLength(1);
});
it("rotates with bounded old-key grace and immediate revocation for both keys", async () => {
  const next = "bfm1_" + randomBytes(32).toString("hex");
  await db.exec("set role anon");
  expect(
    await send("rotate", { nextHash: hash(next).toString("hex") }),
  ).toMatchObject({ rotated: true });
  expect(await send("health")).toHaveProperty("protocol", 1);
  expect(await send("health", {}, next)).toHaveProperty("protocol", 1);
  expect(
    await forbidden(db, () =>
      send("rotate", { nextHash: hash(token).toString("hex") }),
    ),
  ).toContain("BF_FORBIDDEN");
  await send("rotate", { nextHash: hash(next).toString("hex") }, next);
  await db.exec("reset role");
  await db.query(
    "update private.backup_machine_credentials set previous_until=now()-interval '1 second' where id=$1",
    [id],
  );
  await db.exec("set role anon");
  expect(await forbidden(db, () => send("health"))).toContain("BF_FORBIDDEN");
  expect(await send("health", {}, next)).toHaveProperty("protocol", 1);
});
it("requires verified bounded receipts, makes retries idempotent and constrains cloud jobs", async () => {
  await db.exec("set role anon");
  const receipt = {
    id: randomUUID(),
    file: "2026-11-22T14-00-00-000Z.bfbak",
    bytes: 1000,
    tables: 143,
    rows: 1,
    digest: "a".repeat(64),
    verified: true,
  };
  expect(await forbidden(db, () => send("receipt", receipt))).toContain(
    "BF_INVALID_INPUT",
  );
  await send("snapshot");
  expect(await send("receipt", receipt)).toMatchObject({ accepted: true });
  await send("receipt", receipt);
  expect(
    await forbidden(db, () => send("receipt", { ...receipt, verified: false })),
  ).toContain("BF_INVALID_INPUT");
  await db.exec("reset role");
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from private.backup_runs",
      )
    ).rows[0].n,
  ).toBe(1);
  const source = randomUUID(),
    request = randomUUID();
  await db.query(
    "insert into private.cloud_backup_jobs(id,purpose,status,digest) values($1,'backup','stored',$2)",
    [source, "b".repeat(64)],
  );
  await db.exec("set role anon");
  expect(await send("cloud-download", { source, request })).toEqual({
    id: request,
  });
  await send("cloud-download", { source, request });
  expect(
    await forbidden(db, () =>
      send("cloud-verified", {
        id: source,
        digest: "c".repeat(64),
        verified: true,
      }),
    ),
  ).toContain("BF_INVALID_INPUT");
});
