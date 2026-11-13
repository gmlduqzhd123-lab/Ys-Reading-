import {it,expect,vi} from "vitest";
import {managementTransport} from "../scripts/lib/operator-transport.mjs";
const credential={projectRef:"rbtqtkjnqtcnljvabisa",token:"sbp_"+"x".repeat(40),expiresAt:"2030-01-01T00:00:00Z"};
it("fences the target project and never follows credential-bearing redirects or exposes upstream text",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:credential.projectRef}))).mockResolvedValueOnce(new Response("[]"));
 const c=managementTransport(credential,{fetcher});await c.call("get_project_url",{});await c.call("execute_sql",{query:"select 1"});
 expect(fetcher.mock.calls.every(([url,options])=>url.startsWith("https://api.supabase.com/v1/projects/"+credential.projectRef)&&options.redirect==="error")).toBe(true);
 await expect(c.call("apply_migration",{})).rejects.toThrow("BACKUP_TOOL_NOT_ALLOWED");
 expect(()=>managementTransport({...credential,projectRef:"other"})).toThrow("BACKUP_CREDENTIAL_INVALID");
});
it("distinguishes expired credentials from insufficient permissions and does not fall back",async()=>{
 expect(()=>managementTransport({...credential,expiresAt:"2020-01-01"})).toThrow("BACKUP_CREDENTIAL_EXPIRED");
 const c=managementTransport(credential,{fetcher:async()=>new Response("private upstream detail",{status:403})});
 await expect(c.call("execute_sql",{query:"select 1"})).rejects.toThrow("BACKUP_PERMISSION_DENIED");
});
