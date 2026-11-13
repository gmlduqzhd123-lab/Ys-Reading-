import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from "vitest";
import {randomUUID,randomBytes,createHmac} from "node:crypto";
import type {PGlite} from "@electric-sql/pglite";
import {runtimeDb,forbidden} from "./helpers/runtime-db";
let db:PGlite;const id=randomUUID(),secret=randomBytes(32);
beforeAll(async()=>{db=await runtimeDb();await db.query("insert into private.backup_agents(id,secret) values($1,$2)",[id,secret]);});
afterAll(()=>db?.close());beforeEach(()=>db.exec("begin"));afterEach(()=>db.exec("rollback;reset role"));
const payload=(changes:any={})=>JSON.stringify({version:1,agent:id,sequence:1,checkedAt:new Date().toISOString(),state:"ready",code:"OK",phase:"probe",...changes});
const sign=(p:string)=>createHmac("sha256",secret).update(p).digest("hex");
const send=async(p:string,s=sign(p))=>(await db.query<{v:any}>("select public.backup_agent_report($1,$2) v",[p,s])).rows[0].v;
const health=async()=>(await db.query<{v:any}>("select public.service_backup_health() v")).rows[0].v;
it("distinguishes current permission denial but does not resurrect it after a newer verified backup",async()=>{
 await send(payload({state:"auth_required",code:"BACKUP_PERMISSION_DENIED"}));expect((await health()).code).toBe("BACKUP_PERMISSION_DENIED");
 await db.exec("update private.backup_agents set last_failure_at=now()-interval '5 days'");
 await db.query("insert into private.backup_runs(id,created_at,verified_at,file_name,bytes,table_count,row_count,snapshot_digest) values($1,now()-interval '3 days',now()-interval '3 days','2026-11-10T00-00-00-000Z.bfbak',1,1,1,$2)",[randomUUID(),"a".repeat(64)]);
 expect((await health()).code).toBe("BACKUP_STALE");
});
it("authenticates copy reports, alerts only configured targets, preserves real backup health and fences replay",async()=>{
 await db.query("insert into private.backup_runs(id,created_at,verified_at,file_name,bytes,table_count,row_count,snapshot_digest) values($1,now(),now(),'2026-11-13T00-00-00-000Z.bfbak',1,1,1,$2)",[randomUUID(),"a".repeat(64)]);
 const targets:Array<{kind:string;configured:boolean;state:string;external:boolean;digest:string|null;verifiedAt:string|null;bytes:number|null;sourceCreatedAt:string|null}>=[{kind:"recovery-kit",configured:true,state:"verified",external:false,digest:"a".repeat(64),verifiedAt:new Date().toISOString(),bytes:100,sourceCreatedAt:new Date().toISOString()},{kind:"cloud-mirror",configured:false,state:"unconfigured",external:false,digest:null,verifiedAt:null,bytes:null,sourceCreatedAt:null}];
 const copyPayload=(sequence:number,values=targets)=>JSON.stringify({version:2,agent:id,sequence,checkedAt:new Date().toISOString(),targets:values});
 const copySend=(p:string,s=sign(p))=>db.query<{v:any}>("select public.backup_copy_report($1,$2) v",[p,s]);
 await db.exec("set role anon");const p=copyPayload(1);await copySend(p);expect((await health()).copies).toMatchObject({configured:true,external:false,healthy:true});
 await db.exec("reset role;update private.backup_copy_reports set source_created_at=now()-interval '5 days' where configured");
 expect((await health()).copies).toMatchObject({healthy:false,code:"BACKUP_COPY_STALE"});
 await db.exec("update private.backup_copy_reports set source_created_at=now() where configured;set role anon");
 expect((await copySend(p)).rows[0].v.replayed).toBe(true);
 const bad=copyPayload(2,targets.map(t=>t.kind==="recovery-kit"?{...t,state:"failed",digest:null,verifiedAt:null,bytes:null}:t));
 expect(await forbidden(db,()=>copySend(bad,sign(p)))).toContain("BF_FORBIDDEN");await copySend(bad);
 expect((await health()).copies).toMatchObject({healthy:false,code:"BACKUP_COPY_FAILED"});
 expect(await forbidden(db,()=>db.query("select * from private.backup_copy_reports"))).toContain("permission denied");
 await db.exec("reset role;update private.backup_copy_reports set checked_at=now()-interval '3 hours',state='verified'");
 expect((await health()).copies.healthy).toBe(false);
});
it("accepts a signed anonymous status, rejects tampering, and does not expose credentials",async()=>{
 await db.exec("set role anon");const p=payload();expect((await send(p)).accepted).toBe(true);
 expect(await forbidden(db,()=>send(payload({sequence:2}),sign(p)))).toContain("BF_FORBIDDEN");
 expect(await forbidden(db,()=>db.query("select * from private.backup_agents"))).toContain("permission denied");
 const h=await health();expect(h.agentState).toBe("ready");expect(JSON.stringify(h)).not.toContain(secret.toString("hex"));expect(h.healthy).toBe(false);
});
it("fences replays, permits identical delivery retry, and rejects revoked agents",async()=>{
 const p=payload({sequence:2});await send(p);expect((await send(p)).replayed).toBe(true);
 expect(await forbidden(db,()=>send(payload()))).toContain("BF_IDEMPOTENCY_CONFLICT");
 await db.query("update private.backup_agents set active=false where id=$1",[id]);expect(await forbidden(db,()=>send(payload({sequence:3})))).toContain("BF_FORBIDDEN");
});
it("rejects nulls, extra fields, stale timestamps and dishonest state/code combinations",async()=>{
 for(const change of [{code:null},{agent:null},{phase:null},{sequence:0},{sequence:1.5},{state:"ready",code:"MCP_AUTH_REQUIRED"},{state:"auth_required",code:"OK"},{extra:"secret"},{checkedAt:"2020-01-01T00:00:00Z"}]) {
   expect(await forbidden(db,()=>send(payload(change)))).toMatch(/BF_INVALID_INPUT|invalid input syntax/);
 }
});
it("keeps an authentication incident open after reconnection and forged completion until a real restore receipt",async()=>{
 await db.query("insert into private.backup_runs(id,created_at,verified_at,file_name,bytes,table_count,row_count,snapshot_digest) values($1,now(),now(),'2026-11-08T00-00-00-000Z.bfbak',1,1,1,$2)",[randomUUID(),"a".repeat(64)]);
 await send(payload({state:"auth_required",code:"MCP_AUTH_REQUIRED"}));expect((await health()).code).toBe("BACKUP_AUTH_REQUIRED");
 await send(payload({sequence:2}));expect((await health()).code).toBe("BACKUP_RECOVERY_PENDING");
 await send(payload({sequence:3,state:"completed",phase:"backup"}));expect((await health()).healthy).toBe(false);
 await db.exec("update private.backup_runs set verified_at=clock_timestamp()");expect((await health()).healthy).toBe(true);
});
it("detects a silent PC independently from a fresh verified backup",async()=>{
 await db.query("insert into private.backup_runs(id,created_at,verified_at,file_name,bytes,table_count,row_count,snapshot_digest) values($1,now(),now(),'2026-11-08T00-00-00-000Z.bfbak',1,1,1,$2)",[randomUUID(),"a".repeat(64)]);
 await db.query("update private.backup_agents set last_seen_at=now()-interval '3 hours',state='completed' where id=$1",[id]);
 expect(await health()).toMatchObject({code:"BACKUP_AGENT_OFFLINE",healthy:false,backupHealthy:true,agentHealthy:false});
 await send(payload());expect((await health()).code).toBe("OK");
});
