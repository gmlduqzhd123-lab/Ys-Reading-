import { it,expect,vi,afterEach } from "vitest";
import { backupDue,runBackupAgent } from "../scripts/lib/backup-agent.mjs";
import { startupErrorCode } from "../scripts/lib/native-mcp.mjs";
import { backupIncidentText } from "../scripts/lib/incident-notification.mjs";
const now=Date.parse("2026-11-08T03:00:00Z");
afterEach(()=>vi.useRealTimers());
function harness(state:any={},request?:any) {
  vi.useFakeTimers();vi.setSystemTime(now);
  return {state,request,now,save:vi.fn(),report:vi.fn().mockResolvedValue(undefined),probe:vi.fn().mockResolvedValue(undefined),backup:vi.fn().mockResolvedValue({ok:true,verified:true})};
}
it("detects the typed Supabase reauthentication reason without trusting other servers",()=>{
 const params={name:"supabase",status:"failed",failureReason:"reauthenticationRequired"};
 expect(startupErrorCode({method:"mcpServer/startupStatus/updated",params})).toBe("MCP_AUTH_REQUIRED");
 expect(startupErrorCode({method:"mcpServer/startupStatus/updated",params:{...params,name:"another"}})).toBeNull();
});
it("uses the KST daily cutoff and recovers missed backups without duplicating fresh ones",()=>{
 expect(backupDue({lastVerifiedAt:"2026-11-07T11:00:00Z"},now)).toBe(false);
 expect(backupDue({lastVerifiedAt:"2026-11-07T09:59:00Z"},now)).toBe(true);
 expect(backupDue({lastVerifiedAt:new Date(now).toISOString()},now+7*3600000)).toBe(true);
});
it("reports authentication failure independently while never attempting a backup",async()=>{
 const h=harness();h.probe.mockRejectedValue(Error("MCP_AUTH_REQUIRED"));
 expect(await runBackupAgent(h)).toEqual({ok:false,code:"MCP_AUTH_REQUIRED"});
 expect(h.report).toHaveBeenCalledWith("auth_required","MCP_AUTH_REQUIRED","probe");expect(h.backup).not.toHaveBeenCalled();
 expect(Date.parse(h.state.nextCheckAt)-now).toBe(30*60000);
 const again=await runBackupAgent({...h,now:now+15*60000});expect(again.skipped).toBe(true);expect(h.probe).toHaveBeenCalledTimes(1);
});
it("retries transient failures with bounded backoff and runs a verified catch-up after recovery",async()=>{
 const h=harness();h.probe.mockRejectedValueOnce(Error("MCP_TIMEOUT"));
 await runBackupAgent(h);expect(Date.parse(h.state.nextCheckAt)-now).toBe(15*60000);
 vi.setSystemTime(now+15*60000);
 expect((await runBackupAgent({...h,now:now+15*60000})).backedUp).toBe(true);
 expect(h.backup).toHaveBeenCalledTimes(1);expect(h.state.needsRecovery).toBe(false);
 expect(h.report).toHaveBeenLastCalledWith("completed","OK","backup");
});
it("never reports completion when archive restore verification fails",async()=>{
 const h=harness();h.backup.mockResolvedValue({ok:true,verified:false});
 expect((await runBackupAgent(h)).ok).toBe(false);expect(h.state.lastVerifiedAt).toBeUndefined();expect(h.state.needsRecovery).toBe(true);
 expect(h.report).toHaveBeenLastCalledWith("backup_failed","BACKUP_RUN_FAILED","backup");
});
it("still backs up if status delivery is unavailable, then retries delivery",async()=>{
 const h=harness();h.report.mockRejectedValue(Error("network confidential detail"));
 const r=await runBackupAgent(h);expect(r.ok).toBe(true);expect(r.reportDelivered).toBe(false);expect(h.state.lastVerifiedAt).toBeTruthy();
 expect(Date.parse(h.state.nextCheckAt)-now).toBe(15*60000);
});
it("honors a fresh manual request once through the same scheduled runner",async()=>{
 const request={id:"request1",requestedAt:new Date(now).toISOString()};
 const h=harness({lastVerifiedAt:new Date(now).toISOString(),nextCheckAt:new Date(now+3600000).toISOString()},request);
 expect((await runBackupAgent(h)).backedUp).toBe(true);expect(h.state.completedRequest).toBe(request.id);
 expect((await runBackupAgent(h)).skipped).toBe(true);expect(h.backup).toHaveBeenCalledTimes(1);
});
it("does not let a pending manual request bypass authentication retry backoff",async()=>{
 const h=harness({}, {id:"pending",requestedAt:new Date(now).toISOString()});h.probe.mockRejectedValue(Error("MCP_AUTH_REQUIRED"));
 await runBackupAgent(h);
 expect((await runBackupAgent({...h,now:now+15*60000})).skipped).toBe(true);
 expect(h.state.completedRequest).toBeUndefined();expect(h.probe).toHaveBeenCalledOnce();
});
it("does hourly preflight without full backup and preserves safe actionable incident messages",async()=>{
 const h=harness({lastVerifiedAt:new Date(now).toISOString()});
 expect((await runBackupAgent(h)).backedUp).toBe(false);expect(h.probe).toHaveBeenCalledOnce();expect(h.backup).not.toHaveBeenCalled();
 expect(backupIncidentText("BACKUP_AUTH_REQUIRED").text).toContain("재인증");
 expect(backupIncidentText("private token").text).not.toContain("private token");
});
