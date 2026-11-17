export const taskFailureCodes = ["BACKUP_TASK_MISSING","BACKUP_TASK_DISABLED","BACKUP_TASK_MISCONFIGURED","BACKUP_TASK_FAILED","BACKUP_TASK_STALE","BACKUP_TASK_CHECK_UNAVAILABLE","BACKUP_WATCHDOG_UNAVAILABLE"];
/** @param {unknown} value @param {{role?:string,now?:number,installedAt?:string}} options */
export function assessBackupTask(value,{role="backup",now=Date.now(),installedAt}={}) {
 const result=()=>{
  if(!value||value.inspectionFailed)return "BACKUP_TASK_CHECK_UNAVAILABLE";
  if(value.exists===false)return "BACKUP_TASK_MISSING";
  if(value.exists!==true)return "BACKUP_TASK_CHECK_UNAVAILABLE";
  if(value.enabled===false||value.state==="Disabled")return "BACKUP_TASK_DISABLED";
  if(value.enabled!==true||value.configured!==true)return "BACKUP_TASK_MISCONFIGURED";
  if(["Running","Queued"].includes(value.state))return "OK";
  const installed=Date.parse(installedAt),last=Date.parse(value.lastRun),next=Date.parse(value.nextRun);
  if(value.result===267009&&Number.isFinite(last)&&last<=now+60000&&now-last<=45*60000)return "OK";
  const grace=Number.isFinite(installed)&&installed<=now+60000&&now-installed<=5*60000&&Number.isFinite(next)&&next>=now-60000&&next<=now+5*60000;
  if(value.result===267011&&grace)return "OK";
  if(!Number.isSafeInteger(value.result))return "BACKUP_TASK_CHECK_UNAVAILABLE";
  if(value.result!==0)return "BACKUP_TASK_FAILED";
  if(!Number.isFinite(last)||last>now+60000)return "BACKUP_TASK_CHECK_UNAVAILABLE";
  if(last<=0||now-last>45*60000)return grace?"OK":"BACKUP_TASK_STALE";
  return "OK";
 };
 const code=result();return role==="watchdog"&&code!=="OK"?"BACKUP_WATCHDOG_UNAVAILABLE":code;
}
export function watchdogFailure(taskCode,authCode) {
 if(["BACKUP_TASK_MISSING","BACKUP_TASK_DISABLED","BACKUP_TASK_MISCONFIGURED"].includes(taskCode))return taskCode;
 return authCode!=="OK"?authCode:taskCode;
}
