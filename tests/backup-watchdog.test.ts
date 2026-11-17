import {it,expect,vi} from "vitest";
import {assessBackupTask,watchdogFailure,taskFailureCodes} from "../scripts/lib/backup-task-policy.mjs";
import {probeBackupAccess,runBackupWatchdog,signalWatchdogFailure} from "../scripts/lib/backup-watchdog.mjs";
import {runBackupAgent} from "../scripts/lib/backup-agent.mjs";
const now=Date.parse('2026-11-17T14:00:00Z');
const healthy={exists:true,enabled:true,configured:true,state:'Ready',result:0,lastRun:new Date(now-60000).toISOString(),nextRun:new Date(now+60000).toISOString()};
it('distinguishes a missing, disabled, changed, failed, stale or unreadable backup task',()=>{
 for(const [value,code]of [[{exists:false},'BACKUP_TASK_MISSING'],[{...healthy,enabled:false},'BACKUP_TASK_DISABLED'],[{...healthy,configured:false},'BACKUP_TASK_MISCONFIGURED'],[{...healthy,result:3221225786},'BACKUP_TASK_FAILED'],[{...healthy,lastRun:new Date(now-46*60000).toISOString()},'BACKUP_TASK_STALE'],[{inspectionFailed:true},'BACKUP_TASK_CHECK_UNAVAILABLE']] as const){expect(assessBackupTask(value,{now})).toBe(code);expect(assessBackupTask(value,{now,role:'watchdog'})).toBe('BACKUP_WATCHDOG_UNAVAILABLE');}
 expect(assessBackupTask(healthy,{now})).toBe('OK');
});
it('allows a running task and bounded first-install grace, never an indefinitely unstarted task',()=>{
 expect(assessBackupTask({...healthy,state:'Running',result:267009},{now})).toBe('OK');
 const fresh={...healthy,result:267011,lastRun:'1601-01-01T00:00:00Z'};
 expect(assessBackupTask(fresh,{now,installedAt:new Date(now-60000).toISOString()})).toBe('OK');
 expect(assessBackupTask(fresh,{now,installedAt:new Date(now-6*60000).toISOString()})).toBe('BACKUP_TASK_FAILED');
 expect(assessBackupTask({...healthy,lastRun:new Date(now+120000).toISOString()},{now})).toBe('BACKUP_TASK_CHECK_UNAVAILABLE');
});
it('probes the actual scoped project and write permission without changing rows or reading OAuth tokens',async()=>{
 const client={call:vi.fn().mockResolvedValueOnce({url:'https://rbtqtkjnqtcnljvabisa.supabase.co'}).mockResolvedValueOnce([{permitted:0}]),close:vi.fn()};
 expect(await probeBackupAccess(async()=>client,'rbtqtkjnqtcnljvabisa')).toBe('OK');expect(client.call.mock.calls[1][1].query).toContain('where false');expect(client.close).toHaveBeenCalledOnce();
 client.call.mockReset().mockResolvedValueOnce({url:'https://other.supabase.co'});
 expect(await probeBackupAccess(async()=>client,'rbtqtkjnqtcnljvabisa')).toBe('PROJECT_SCOPE_MISMATCH');expect(client.call).toHaveBeenCalledOnce();
});
it('detects expired authentication and permission denial while closing a failed transport',async()=>{
 for(const code of ['MCP_AUTH_REQUIRED','BACKUP_PERMISSION_DENIED']){const close=vi.fn();expect(await probeBackupAccess(async()=>({call:async()=>{throw Error(code)},close}),'rbtqtkjnqtcnljvabisa')).toBe(code);expect(close).toHaveBeenCalledOnce();}
});
it('reports through the independent channel and marks recovery due, without issuing a success receipt',async()=>{
 const state:any={lastVerifiedAt:'2026-11-16T14:00:00Z'},report=vi.fn().mockResolvedValue(undefined),save=vi.fn();
 const r=await runBackupWatchdog({state,task:{code:'OK'},probe:async()=>'MCP_AUTH_REQUIRED',report,save,now});
 expect(r).toMatchObject({monitorOk:true,healthy:false,code:'MCP_AUTH_REQUIRED',delivered:true});expect(report).toHaveBeenCalledWith('auth_required','MCP_AUTH_REQUIRED','probe');expect(state.needsRecovery).toBe(true);expect(state.lastVerifiedAt).toBe('2026-11-16T14:00:00Z');
});
it('keeps an undelivered fault actionable and does not reset the retry backoff for repeated identical faults',async()=>{
 const state:any={needsRecovery:true,lastWatchdogFailureCode:'BACKUP_TASK_MISSING',nextCheckAt:new Date(now+30*60000).toISOString()};
 const r=await signalWatchdogFailure({state,code:'BACKUP_TASK_MISSING',save:()=>{},report:async()=>{throw Error('network')},now});
 expect(r.delivered).toBe(false);expect(state.nextCheckAt).toBe(new Date(now+30*60000).toISOString());expect(state.needsRecovery).toBe(true);
});
it('never clears an incident on a healthy probe; the primary must create and verify a fresh backup',async()=>{
 const state:any={state:'auth_required',code:'MCP_AUTH_REQUIRED',needsRecovery:true},save=vi.fn(),report=vi.fn();
 const r=await runBackupWatchdog({state,task:{code:'OK'},probe:async()=>'OK',save,report,now});expect(r.healthy).toBe(true);expect(state.state).toBe('auth_required');expect(state.needsRecovery).toBe(true);expect(report).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
});
it('prioritizes a deleted/disabled task, then authentication, and exposes only bounded known problem codes',()=>{
 expect(watchdogFailure('BACKUP_TASK_MISSING','MCP_AUTH_REQUIRED')).toBe('BACKUP_TASK_MISSING');expect(watchdogFailure('BACKUP_TASK_FAILED','MCP_AUTH_REQUIRED')).toBe('MCP_AUTH_REQUIRED');expect(taskFailureCodes).toContain('BACKUP_WATCHDOG_UNAVAILABLE');
});
it('keeps a missing watchdog actionable after a completed backup and requires another real restore after repair',async()=>{
 vi.useFakeTimers();vi.setSystemTime(now);
 try {
  const state:any={lastVerifiedAt:new Date(now).toISOString(),needsRecovery:false,nextCheckAt:new Date(now+3600000).toISOString()},save=vi.fn(),report=vi.fn().mockResolvedValue(undefined);
  await signalWatchdogFailure({state,code:'BACKUP_WATCHDOG_UNAVAILABLE',save,report,now});
  expect(state).toMatchObject({needsRecovery:true,code:'BACKUP_WATCHDOG_UNAVAILABLE'});expect(report).toHaveBeenLastCalledWith('retry_wait','BACKUP_WATCHDOG_UNAVAILABLE','probe');
  const backup=vi.fn().mockResolvedValue({ok:true,verified:true});
  expect(await runBackupAgent({state,save,report,backup,probe:async()=>{},now,request:undefined})).toMatchObject({ok:true,backedUp:true});expect(backup).toHaveBeenCalledOnce();expect(state.needsRecovery).toBe(false);
 }finally{vi.useRealTimers();}
});
