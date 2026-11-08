import {it,expect} from "vitest";
import {cloudHealth} from "../scripts/lib/cloud-health.mjs";
import {registrationDecision,publicFingerprint} from "../scripts/lib/cloud-registration.mjs";
import {vaultKey} from "../scripts/lib/operator-vault.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const now=Date.parse("2026-11-08T09:00:00Z"),at=(hours:number)=>new Date(now-hours*3600000).toISOString();
it("never silently generates a replacement key when an archive already exists",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"bf-key-guard-"));
 try{fs.writeFileSync(path.join(dir,"old.bfbak"),"existing archive");expect(()=>vaultKey(dir)).toThrow("RECOVERY_KEY_MISSING");expect(fs.existsSync(path.join(dir,"operator-key.dpapi"))).toBe(false);expect(fs.readFileSync(path.join(dir,"old.bfbak"),"utf8")).toBe("existing archive");}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
it("fails closed for missing endpoint, malformed data, stale and future timestamps",()=>{
 for(const [status,d] of [[404,{}],[200,{configured:false}],[200,{configured:true,healthy:true,restoreVerified:true,storedAt:"invalid"}],[200,{configured:true,healthy:true,restoreVerified:true,storedAt:at(-1),verifiedAt:at(-1)}]])expect(cloudHealth(status,d,now).healthy).toBe(false);
});
it("distinguishes a new archive grace period from overdue verification and recovery",()=>{
 const base={configured:true,healthy:true,restoreVerified:false,storedAt:at(1),verifiedAt:null};
 expect(cloudHealth(200,base,now).code).toBe("CLOUD_RESTORE_PENDING");
 expect(cloudHealth(200,{...base,storedAt:at(3)},now)).toMatchObject({healthy:false,warning:true,code:"CLOUD_RESTORE_OVERDUE"});
 expect(cloudHealth(200,{...base,restoreVerified:true,verifiedAt:at(0.5)},now).healthy).toBe(true);
 expect(cloudHealth(200,{...base,storedAt:at(3),restoreVerified:true,verifiedAt:at(4)},now).healthy).toBe(false);
 expect(cloudHealth(200,{...base,healthy:false},now).code).toBe("CLOUD_BACKUP_STALE");
});
it("never replaces a recovery public key without old-key identity, restore proof, retention and explicit confirmation",()=>{
 expect(registrationDecision(null,"next")).toBe("register");
 expect(registrationDecision("old","old")).toBe("register");
 for(const r of [undefined,{}, {previous:"old",confirmed:publicFingerprint("old"),restored:true}])expect(()=>registrationDecision("old","next",r)).toThrow("ROTATION_REQUIRED");
 expect(registrationDecision("old","next",{previous:"old",confirmed:publicFingerprint("old"),restored:true,retained:true})).toBe("rotate");
});
