// User enters a project-scoped PAT through private stdin; never argv or logs.
import fs from "node:fs";
import path from "node:path";
import {defaultVault,vaultKey,encryptBackup,projectRef} from "./lib/operator-vault.mjs";
import {managementTransport} from "./lib/operator-transport.mjs";
try{
 let raw="";for await(const chunk of process.stdin){raw+=chunk;if(raw.length>12000)throw Error("INPUT_TOO_LARGE");}
 const input=JSON.parse(raw);raw="";
 if(input.projectRef!==projectRef||Date.parse(input.expiresAt)>Date.now()+91*86400000)throw Error("SCOPED_CREDENTIAL_REQUIRED");
 const client=managementTransport(input);
 await client.call("get_project_url",{});
 // Read/write permission is needed for restore receipts. This transaction never
 // changes data, calls external URLs, creates roles or issues additional secrets.
 await client.call("execute_sql",{query:"begin; select count(*) from private.backup_runs; update private.backup_runs set verified_at=verified_at where false; rollback;"});
 const directory=defaultVault(),file=path.join(directory,"management-access.bfconfig"),tmp=file+".tmp";
 fs.writeFileSync(tmp,encryptBackup({projectRef,token:input.token,expiresAt:input.expiresAt},vaultKey(directory,{create:false})),{mode:0o600});
 fs.renameSync(tmp,file);
 console.log(JSON.stringify({configured:true,mode:"scoped-token",projectRef,expiresAt:input.expiresAt}));
}catch(e){console.log(JSON.stringify({configured:false,code:/^[A-Z_]+$/.test(e.message)?e.message:"CONFIGURATION_FAILED"}));process.exitCode=1;}
