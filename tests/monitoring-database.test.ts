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
import { runtimeDb, forbidden } from "./helpers/runtime-db";
let db: PGlite;
describe("Trusted independent monitoring", () => {
  it("allows anonymous release metadata without granting access to the private schema",async()=>{
    await db.exec("set role anon");
    expect((await db.query<{v:boolean}>("select has_schema_privilege('anon','private','usage') v")).rows[0].v).toBe(false);
    expect((await db.query<{v:any}>("select public.service_release_contract() v")).rows[0].v).toMatchObject({monitorRechecks:true,cloudBackup:true,batchExports:true,learningSignals:true,scopeCache:true});
  });
  it("never labels ciphertext creation as a successful restore of the latest archive",async()=>{
    await db.query("insert into private.cloud_backup_config(public_key) values($1)",["A".repeat(88)]);
    await db.exec("insert into private.cloud_backup_jobs(purpose,status,created_at,verified_at) values('backup','stored',now()-interval '1 hour',now()-interval '30 minutes'),('backup','stored',now(),null)");
    await db.exec("set role anon");
    const value=(await db.query<{v:any}>("select public.service_cloud_backup_health() v")).rows[0].v;
    expect(value).toMatchObject({configured:true,healthy:true,restoreVerified:false,verifiedAt:null,separateProvider:false});
  });
  it("denies anonymous cloud jobs and permits a service worker to consume a capability once",async()=>{
    await db.query("insert into private.cloud_backup_config(public_key) values($1)",["A".repeat(88)]);
    const id=(await db.query<{id:string}>("insert into private.cloud_backup_jobs(purpose) values('download') returning id")).rows[0].id;
    await db.exec("set role anon");
    expect(await forbidden(db,()=>db.query("select public.claim_cloud_backup_job($1)",[id]))).toContain("permission denied");
    expect(await forbidden(db,()=>db.query("select * from private.cloud_backup_jobs"))).toContain("permission denied");
    await db.exec("reset role;set role service_role");
    expect((await db.query<{v:any}>("select public.claim_cloud_backup_job($1) v",[id])).rows[0].v.purpose).toBe("download");
    expect(await forbidden(db,()=>db.query("select public.claim_cloud_backup_job($1)",[id]))).toContain("BF_CLOUD_JOB_INVALID");
  });
  it("retains an isolated timeout and opens an incident only after a failed recheck",async()=>{
    const first=new Date(Date.now()-90000).toISOString(),second=new Date(Date.now()-30000).toISOString();
    await record(new Date(Date.now()-180000).toISOString(),true);
    expect((await db.query<{v:boolean}>("select private.accept_monitor_result($1,null,'{}',null,'timeout',1) v",[first])).rows[0].v).toBe(true);
    expect((await status()).checks[0].healthy).toBe(true);
    await db.query("select private.accept_monitor_result($1,null,'{}',null,'timeout',2)",[second]);
    expect((await status()).checks[0].healthy).toBe(false);
    expect((await status()).incidents).toHaveLength(1);
    expect((await db.query("select attempt,transport from private.monitor_diagnostics order by checked_at")).rows).toEqual([{attempt:1,transport:"timeout"},{attempt:2,transport:"timeout"}]);
  });
  beforeAll(async () => {
    db = await runtimeDb();
  });
  afterAll(() => db.close());
  beforeEach(() => db.exec("begin"));
  afterEach(() => db.exec("rollback;reset role"));
  const record = (at: string, healthy: boolean, code = "HEALTHY") =>
    db.query("select private.record_service_check($1,$2,$3,$4)", [
      "supabase-cron",
      at,
      healthy,
      code,
    ]);
  const status = async () =>
    (await db.query<{ v: any }>("select public.service_monitor_status() v"))
      .rows[0].v;
  it("publishes sanitized freshness without allowing forged checks", async () => {
    await record(new Date().toISOString(), true);
    await db.exec("set role anon");
    expect((await status()).checks[0]).toMatchObject({
      healthy: true,
      stale: false,
    });
    expect(
      await forbidden(db, () => record(new Date().toISOString(), false)),
    ).toContain("permission denied");
    expect(
      await forbidden(db, () =>
        db.query("select * from private.monitor_requests"),
      ),
    ).toContain("permission denied");
  });
  it("coalesces a failure episode, records recovery and ignores out-of-order results", async () => {
    const ago = (m: number) => new Date(Date.now() - m * 60000).toISOString();
    await record(ago(30), false, "HTTP_503");
    await record(ago(25), false, "TIMEOUT");
    expect((await status()).incidents).toHaveLength(1);
    await record(ago(20), true);
    await record(ago(22), false);
    let state = await status();
    expect(state.incidents[0].closed_at).toBeTruthy();
    expect(state.checks[0]).toMatchObject({ healthy: true, stale: true });
    await record(ago(1), false);
    expect((await status()).incidents).toHaveLength(2);
  });
  it("rejects unbounded or untrusted error text", async () => {
    expect(
      await forbidden(db, () =>
        record(new Date().toISOString(), false, "secret in provider error"),
      ),
    ).toContain("BF_INVALID_INPUT");
  });
  it("retains only bounded diagnostic metadata and denies client writes and operator history reads",async()=>{
    const at=new Date().toISOString();
    const body={errorId:"10000000-0000-4000-8000-000000000001",commit:"a".repeat(40),diagnostics:{stage:"database_pool",databaseMs:5000,authenticationMs:42},message:"PRIVATE STUDENT CONTENT",token:"SECRET"};
    await db.query("select private.record_monitor_diagnostic($1,503,$2,$3)",[at,body,"iad1:request-1"]);
    const row=(await db.query("select * from private.monitor_diagnostics")).rows[0];
    expect(row).toMatchObject({stage:"database_pool",database_ms:5000,authentication_ms:42,deployment_sha:"a".repeat(40)});
    expect(JSON.stringify(row)).not.toMatch(/PRIVATE|SECRET/);
    await db.exec("set role anon");
    expect(await forbidden(db,()=>db.query("select * from private.monitor_diagnostics"))).toContain("permission denied");
    expect(await forbidden(db,()=>db.query("select public.operator_monitor_diagnostics()"))).toContain("permission denied");
    await db.exec("reset role;set role authenticated");
    expect(await forbidden(db,()=>db.query("select public.operator_monitor_diagnostics()"))).toContain("BF_FORBIDDEN");
  });
  it("classifies non-JSON hosting failures and timeouts without inventing a DB failure",async()=>{
    await db.query("select private.record_monitor_diagnostic($1,500,$2,$3)",[new Date(Date.now()-1000).toISOString(),{},"invalid secret text"]);
    await db.query("select private.record_monitor_diagnostic($1,null,$2,null)",[new Date().toISOString(),{}]);
    const rows=(await db.query("select stage,upstream_request_id from private.monitor_diagnostics order by checked_at")).rows;
    expect(rows).toEqual([{stage:"platform",upstream_request_id:null},{stage:"timeout",upstream_request_id:null}]);
  });
});
