import fs from "node:fs";
import path from "node:path";
import {nativeMcp} from "./native-mcp.mjs";
import {defaultVault,vaultKey,decryptBackup,projectRef} from "./operator-vault.mjs";

// A configured project-scoped credential is authoritative. Never hide expired
// credentials or missing permissions by silently falling back to another account.
export function managementTransport(credential,{fetcher=fetch,now=Date.now()}={}){
 if(credential?.projectRef!==projectRef||typeof credential.token!=="string"||!/^sbp_[A-Za-z0-9_-]{20,}$/.test(credential.token))throw Error("BACKUP_CREDENTIAL_INVALID");
 const expires=Date.parse(credential.expiresAt);
 if(!Number.isFinite(expires)||expires<=now)throw Error("BACKUP_CREDENTIAL_EXPIRED");
 const base=`https://api.supabase.com/v1/projects/${projectRef}`;
 async function request(url,options={}){
  let r;try{r=await fetcher(url,{...options,headers:{Authorization:`Bearer ${credential.token}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(55000),redirect:"error"});}catch{throw Error("BACKUP_TRANSPORT_UNAVAILABLE");}
  if(!r.ok)throw Error(r.status===401?"BACKUP_CREDENTIAL_EXPIRED":r.status===403?"BACKUP_PERMISSION_DENIED":"BACKUP_TRANSPORT_FAILED");
  try{return await r.json();}catch{throw Error("BACKUP_RESPONSE_INVALID");}
 }
 return {mode:"scoped-token",expiresAt:credential.expiresAt,expiresSoon:expires-now<7*86400000,close(){},async call(tool,args){
  if(tool==="get_project_url"){
   const p=await request(base);if(p?.id!==projectRef)throw Error("PROJECT_SCOPE_MISMATCH");return {url:`https://${projectRef}.supabase.co`};
  }
  if(tool!=="execute_sql"||typeof args?.query!=="string")throw Error("BACKUP_TOOL_NOT_ALLOWED");
  const rows=await request(base+"/database/query",{method:"POST",body:JSON.stringify({query:args.query,read_only:false})});
  if(!Array.isArray(rows))throw Error("BACKUP_RESPONSE_INVALID");return rows;
 }};
}
export async function operatorTransport(){
 const directory=defaultVault(),file=path.join(directory,"management-access.bfconfig");
 if(!fs.existsSync(file))return nativeMcp();
 return managementTransport(decryptBackup(fs.readFileSync(file,"utf8"),vaultKey(directory,{create:false})));
}
