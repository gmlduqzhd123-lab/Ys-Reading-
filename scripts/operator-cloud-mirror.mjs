import fs from "node:fs";
import path from "node:path";
import {defaultVault,vaultKey,encryptBackup,decryptBackup,projectRef} from "./lib/operator-vault.mjs";
import {copyLocationKind} from "./lib/backup-copy.mjs";
import {copyCloudArchive} from "./lib/cloud-mirror.mjs";
const vault=defaultVault(),configFile=path.join(vault,"cloud-mirror.bfconfig"),statusFile=path.join(vault,"cloud-mirror-status.json");
try{
  const key=vaultKey(vault,{create:false});
  if(process.argv[2]==="configure"){
    const destination=path.resolve(process.argv[3]??"");
    if(!process.argv[3]||!path.isAbsolute(process.argv[3])||!["network","removable"].includes(copyLocationKind(destination)))throw Error("EXTERNAL_DESTINATION_REQUIRED");
    fs.writeFileSync(configFile,encryptBackup({projectRef,destination},key),{mode:0o600});
    console.log(JSON.stringify({configured:true,copied:false}));
  }else if(!fs.existsSync(configFile)){console.log(JSON.stringify({configured:false,code:"EXTERNAL_DESTINATION_REQUIRED"}));}
  else{
    const config=decryptBackup(fs.readFileSync(configFile,"utf8"),key),proof=JSON.parse(fs.readFileSync(path.join(vault,"cloud-status.json"),"utf8"));
    if(config.projectRef!==projectRef||!["network","removable"].includes(copyLocationKind(config.destination)))throw Error("EXTERNAL_DESTINATION_REQUIRED");
    if(!proof.verified||Date.now()-Date.parse(proof.checkedAt)>48*3600000)throw Error("CLOUD_RESTORE_PROOF_REQUIRED");
    const source=path.join(vault,proof.job+".bfcloud");
    const result=copyCloudArchive(source,config.destination,proof.job,proof.cipherDigest);
    fs.writeFileSync(statusFile,JSON.stringify({...result,sourceCreatedAt:proof.sourceCreatedAt??null}),{mode:0o600});console.log(JSON.stringify(result));
  }
}catch(e){const code=/^[A-Z_]+$/.test(e.message)?e.message:"MIRROR_UNAVAILABLE";fs.writeFileSync(statusFile,JSON.stringify({verified:false,code,checkedAt:new Date().toISOString()}),{mode:0o600});console.log(JSON.stringify({verified:false,code}));process.exitCode=1;}
