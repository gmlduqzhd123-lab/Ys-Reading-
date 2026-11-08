import {it,expect} from "vitest";
import {copyTarget,copyWarning} from "../scripts/lib/copy-report.mjs";
it("never reuses an old successful receipt after a failed copy and distinguishes same-PC storage",()=>{
 const receipt={verified:true,backup_digest:"a".repeat(64),bytes:100,verified_at:new Date().toISOString(),location_kind:"same_pc"};
 expect(copyTarget("recovery-kit",true,receipt,1).state).toBe("failed");
 expect(copyTarget("recovery-kit",true,receipt,0)).toMatchObject({state:"verified",external:false});
 expect(copyTarget("cloud-mirror",false,null,0).state).toBe("unconfigured");
 const main={healthy:true,warning:false,code:"OK"};
 expect(copyWarning(main,{configured:false})).toEqual(main);
 expect(copyWarning(main,{configured:true,healthy:false,checkedAt:new Date().toISOString(),code:"BACKUP_COPY_FAILED"})).toMatchObject({healthy:false,warning:true,code:"BACKUP_COPY_FAILED"});
 expect(copyWarning({healthy:false,warning:false,code:"BACKUP_FAILED"},{configured:true,healthy:false})).toMatchObject({code:"BACKUP_FAILED",warning:false});
});
