import {it,expect} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {encryptCloud} from "../supabase/functions/_shared/cloud-crypto.mjs";
import {cloudKey} from "../scripts/lib/cloud-key.mjs";
import {copyCloudArchive} from "../scripts/lib/cloud-mirror.mjs";
it("copies ciphertext only with exact readback, rejects tampering and preserves conflicting destination",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"bf-mirror-"));
 try{
 const dest=path.join(dir,"dest");fs.mkdirSync(dest);const source=path.join(dir,"source");
 const raw=JSON.stringify(await encryptCloud({synthetic:"복구 시험"},cloudKey(randomBytes(32)).publicKey)),digest=createHash("sha256").update(raw).digest("hex"),job=randomUUID();fs.writeFileSync(source,raw);
 expect(copyCloudArchive(source,dest,job,digest)).toMatchObject({verified:true,privateKeyCopied:false});
 expect(fs.readFileSync(path.join(dest,job+".bfcloud"),"utf8")).toBe(raw);
 expect(()=>copyCloudArchive(source,dest,job,"0".repeat(64))).toThrow("DIGEST");
 fs.writeFileSync(path.join(dest,job+".bfcloud"),"existing");
 expect(()=>copyCloudArchive(source,dest,job,digest)).toThrow("CONFLICT");
 expect(fs.readFileSync(path.join(dest,job+".bfcloud"),"utf8")).toBe("existing");
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
