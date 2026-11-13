import {it,expect} from "vitest";
import {recoveryPreflight} from "../scripts/lib/recovery-preflight.mjs";
const env={NEXT_PUBLIC_SUPABASE_URL:"https://abcdefghijklmnopqrst.supabase.co",NEXT_PUBLIC_APP_URL:"https://restore.example.test",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"};
it("never probes production or sends a privileged key and does not call metadata-only checks a cutover",async()=>{
 await expect(recoveryPreflight({...env,NEXT_PUBLIC_SUPABASE_URL:"https://rbtqtkjnqtcnljvabisa.supabase.co"})).rejects.toThrow("INDEPENDENT_TARGET_REQUIRED");
 await expect(recoveryPreflight({...env,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_secret_no"})).rejects.toThrow("PUBLIC_KEY_REQUIRED");
 const result=await recoveryPreflight(env,{fetcher:async(input)=>{const url=String(input);return new Response(JSON.stringify(url.includes('service_release')?{recoveryOperations:true}:url.includes('account-operations')?{service:"bookforest-account-worker",protocol:2}:url.endsWith('/worker')?{code:"JOB_UNAVAILABLE"}:{checks:{database:true,authentication:true}}),{status:url.endsWith('/worker')?403:200});}});
 expect(result.endpointsPassed).toBe(true);expect(result.operationalCutoverVerified).toBe(false);expect(result.callbacks.googleDrive).toBe(env.NEXT_PUBLIC_APP_URL+"/api/google/callback");
});
