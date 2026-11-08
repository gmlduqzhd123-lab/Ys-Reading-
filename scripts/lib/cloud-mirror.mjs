import fs from "node:fs";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
const sha=raw=>createHash("sha256").update(raw).digest("hex");
export function copyCloudArchive(source,destination,job,expectedDigest){
  if(!/^[a-f0-9-]{36}$/.test(job)||!/^[a-f0-9]{64}$/.test(expectedDigest))throw Error("MIRROR_RECEIPT_INVALID");
  if(!path.isAbsolute(destination)||!fs.statSync(destination).isDirectory()||fs.lstatSync(destination).isSymbolicLink())throw Error("MIRROR_DIRECTORY_REQUIRED");
  if(fs.lstatSync(source).isSymbolicLink()||fs.statSync(source).size>64000000)throw Error("MIRROR_SOURCE_INVALID");
  const raw=fs.readFileSync(source),v=JSON.parse(raw);
  if(v.format!=="bookforest-cloud-vault"||v.projectRef!=="rbtqtkjnqtcnljvabisa"||sha(raw)!==expectedDigest)throw Error("MIRROR_DIGEST_MISMATCH");
  const target=path.join(destination,job+".bfcloud"),temporary=path.join(destination,".bookforest-"+randomUUID()+".tmp");
  if(fs.existsSync(target)){
    if(fs.lstatSync(target).isSymbolicLink()||sha(fs.readFileSync(target))!==expectedDigest)throw Error("MIRROR_CONFLICT");
  }else{
    try{fs.writeFileSync(temporary,raw,{flag:"wx",mode:0o600});if(sha(fs.readFileSync(temporary))!==expectedDigest)throw Error("MIRROR_READBACK_FAILED");fs.copyFileSync(temporary,target,fs.constants.COPYFILE_EXCL);if(sha(fs.readFileSync(target))!==expectedDigest)throw Error("MIRROR_READBACK_FAILED");}
    finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  return {verified:true,job,digest:expectedDigest,bytes:raw.length,copiedAt:new Date().toISOString(),privateKeyCopied:false};
}
