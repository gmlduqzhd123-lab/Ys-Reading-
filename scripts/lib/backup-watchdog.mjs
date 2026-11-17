import {safeAgentCode} from "./backup-agent.mjs";
import {watchdogFailure} from "./backup-task-policy.mjs";
export async function probeBackupAccess(open,projectRef) {
 let client;try {
  client=await open();
  if((await client.call("get_project_url",{}))?.url!==`https://${projectRef}.supabase.co`)throw Error("PROJECT_SCOPE_MISMATCH");
  await client.call("execute_sql",{query:"with permission_probe as (update private.backup_runs set verified_at=verified_at where false returning id) select count(*) as permitted from permission_probe;"});
  return "OK";
 } catch(error){return safeAgentCode(error?.message);}finally{client?.close();}
}
export async function signalWatchdogFailure({state,code,save,report,now=Date.now()}) {
 if(code==="OK")return {healthy:true,delivered:false};
 const auth=["MCP_AUTH_REQUIRED","BACKUP_CREDENTIAL_EXPIRED","BACKUP_PERMISSION_DENIED"].includes(code);
 if(state.lastWatchdogFailureCode!==code||!state.needsRecovery)state.nextCheckAt=new Date(now).toISOString();
 state.needsRecovery=true;state.state=auth?"auth_required":"retry_wait";state.code=code;state.checkedAt=new Date(now).toISOString();state.lastWatchdogFailureCode=code;
 save(state);
 let delivered=false;try{await report(state.state,code,"probe");delivered=true;}catch{}
 state.reportDelivered=delivered;save(state);
 return {healthy:false,delivered};
}
export async function runBackupWatchdog({state,task,probe,save,report,now=Date.now()}) {
 const authCode=await probe(),code=watchdogFailure(task.code,authCode);
 const signal=await signalWatchdogFailure({state,code,save,report,now});
 // A successful detector may report an unhealthy target. It cannot claim a
 // verified backup, clear an incident, or overwrite a failed state with ready.
 return {monitorOk:code==="OK"||signal.delivered,healthy:code==="OK",code,authCode,taskCode:task.code,delivered:signal.delivered,checkedAt:new Date(now).toISOString()};
}
