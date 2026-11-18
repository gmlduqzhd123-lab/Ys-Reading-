import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { runtimeDb, forbidden } from "./helpers/runtime-db";
let db: PGlite;
const id = randomUUID(),
  secret = randomBytes(32);
beforeAll(async () => {
  db = await runtimeDb();
  await db.query("insert into private.backup_agents(id,secret) values($1,$2)", [
    id,
    secret,
  ]);
});
afterAll(() => db?.close());
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback;reset role"));
const payload = (x: any = {}) =>
  JSON.stringify({
    version: 3,
    agent: id,
    sequence: 1,
    checkedAt: new Date().toISOString(),
    runId: 123,
    notifiedAt: new Date().toISOString(),
    code: "OK",
    ...x,
  });
const sign = (p: string) =>
  createHmac("sha256", secret).update(p).digest("hex");
const send = (p: string, s = sign(p)) =>
  db.query<{ v: any }>("select public.delivery_agent_report($1,$2) v", [p, s]);
const health = async () =>
  (await db.query<{ v: any }>("select public.service_delivery_health() v"))
    .rows[0].v;
it("reports independent delivery metadata without claiming backup success or changing the backup heartbeat", async () => {
  await db.exec("set role anon");
  const p = payload();
  expect((await send(p)).rows[0].v.accepted).toBe(true);
  expect((await send(p)).rows[0].v.replayed).toBe(true);
  expect(await health()).toMatchObject({ healthy: true, code: "OK" });
  expect(
    await forbidden(db, () =>
      db.exec("select * from private.delivery_observations"),
    ),
  ).toContain("permission denied");
  await db.exec("reset role");
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from private.backup_runs",
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await db.query<{ v: any }>(
        "select last_seen_at v from private.backup_agents where id=$1",
        [id],
      )
    ).rows[0].v,
  ).toBeNull();
});
it("rejects tampering, stale/future signals, invented fields, dishonest health and revoked senders", async () => {
  expect(
    await forbidden(db, () =>
      send(payload({ code: "GITHUB_NOTIFY_FAILED" }), sign(payload())),
    ),
  ).toContain("BF_FORBIDDEN");
  for (const x of [
    { extra: "private" },
    { sequence: 1.5 },
    { checkedAt: null },
    { code: null },
    { notifiedAt: null },
    { runId: null },
    { checkedAt: "2020-01-01T00:00:00Z" },
    { notifiedAt: "2020-01-01T00:00:00Z" },
  ])
    expect(await forbidden(db, () => send(payload(x)))).toMatch(
      /BF_INVALID_INPUT/,
    );
  await db.exec("update private.backup_agents set active=false");
  expect(await forbidden(db, () => send(payload()))).toContain("BF_FORBIDDEN");
});
it("detects stale monitor signals and does not turn old delivery receipts into current success", async () => {
  await send(payload());
  await db.exec(
    "update private.delivery_observations set notified_at=now()-interval '2 hours'",
  );
  expect((await health()).code).toBe("GITHUB_CHECK_DELAYED");
  await db.exec(
    "update private.delivery_observations set observed_at=now()-interval '46 minutes'",
  );
  expect((await health()).code).toBe("DELIVERY_MONITOR_STALE");
});
