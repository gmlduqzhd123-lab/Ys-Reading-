import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import type {PGlite} from "@electric-sql/pglite";
import {runtimeDb,asUser,forbidden} from "./helpers/runtime-db";
let db:PGlite;const actor=randomUUID(),other=randomUUID(),target="abcdefghijklmnopqrst";
const steps={backup:true,database:false,authentication:false,mfa:false,permissions:false,privacy:false,worker:false,google:false};
const save=async(ref=target,id:string|null=null,rev=0,req=randomUUID(),evidence:any=steps)=>(await db.query<{v:any}>("select public.operator_recovery_check($1,$2,$3,$4,$5) v",[ref,evidence,id,rev,req])).rows[0].v;
beforeAll(async()=>{db=await runtimeDb();for(const id of [actor,other])await db.query("insert into auth.users(id) values($1)",[id]);await db.exec("update public.profiles set role='teacher',consent_status='verified'");await db.query("insert into private.operators(user_id) values($1)",[actor]);});
it("requires recent MFA for invitations, supports revoke and cannot activate a recipient",async()=>{
 await asUser(db,actor,"aal1");expect(await forbidden(db,()=>db.query("select public.operator_manage_invitation('recipient@example.com','대체 운영자',false)"))).toContain("BF_MFA_REQUIRED");
 await asUser(db,actor);await db.query("select public.operator_manage_invitation('recipient@example.com','대체 운영자',false)");
 expect((await db.query<{v:any}>("select public.operator_recovery_state() v")).rows[0].v).toMatchObject({operatorCount:1,pendingEmails:[{email:"recipient@example.com"}]});
 await db.query("select public.operator_manage_invitation('recipient@example.com','대체 운영자',true)");
 expect((await db.query<{v:any}>("select public.operator_recovery_state() v")).rows[0].v.pendingEmails).toHaveLength(0);
});
afterAll(()=>db?.close());beforeEach(()=>db.exec("begin"));afterEach(()=>db.exec("rollback;reset role"));
it("requires a real operator with recent MFA and an independent target",async()=>{await asUser(db,other);expect(await forbidden(db,()=>save())).toContain("BF_FORBIDDEN");await asUser(db,actor,"aal1");expect(await forbidden(db,()=>save())).toContain("BF_MFA_REQUIRED");await asUser(db,actor);expect(await forbidden(db,()=>save("rbtqtkjnqtcnljvabisa"))).toContain("BF_INVALID_INPUT");expect(await forbidden(db,()=>save(target,null,0,randomUUID(),{...steps,token:"private"}))).toContain("BF_INVALID_INPUT");});
it("records operator confirmation without claiming a deployment or automated restore, and fences revisions",async()=>{await asUser(db,actor);const request=randomUUID(),r=await save(target,null,0,request);expect(r.source).toBe("operator_confirmation");expect((await save(target,null,0,request)).id).toBe(r.id);await save(target,r.id,1);expect(await forbidden(db,()=>save(target,r.id,1))).toContain("BF_STALE_REVISION");expect((await db.query<{v:any}>("select public.operator_recovery_state() v")).rows[0].v.rehearsals[0]).not.toHaveProperty("cutoverComplete");});
