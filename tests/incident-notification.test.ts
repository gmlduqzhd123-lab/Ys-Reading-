import { it, expect } from "vitest";
import {
  incidentDecision,
  marker,
  backupMarker,
  monitorHealthy,
  backupIncidentText,
} from "../scripts/lib/incident-notification.mjs";
import {taskFailureCodes} from "../scripts/lib/backup-task-policy.mjs";
it('provides separate actionable task/authentication reasons while keeping one owned incident',()=>{
 for(const code of taskFailureCodes)expect(backupIncidentText(code)).toMatchObject({code,text:expect.stringMatching(/예약|작업/)});
 expect(backupIncidentText('BACKUP_AUTH_REQUIRED').text).toContain('재인증');
 const issue={number:9,state:'open',user:{type:'Bot'},body:backupMarker+'\n'+backupIncidentText('BACKUP_TASK_MISSING').marker};
 expect(incidentDecision(false,[issue],backupMarker)).toEqual({create:false,close:[]});
 expect(incidentDecision(true,[issue],backupMarker)).toEqual({create:false,close:[9]});
});
it("deduplicates bot owned notifications and never modifies user issues", () => {
  const issues = [
    { number: 1, state: "open", user: { type: "User" }, body: marker },
    { number: 2, state: "open", user: { type: "Bot" }, body: marker },
  ];
  expect(incidentDecision(false, issues)).toEqual({ create: false, close: [] });
  expect(incidentDecision(true, issues)).toEqual({ create: false, close: [2] });
  expect(incidentDecision(false, []).create).toBe(true);
});
it("keeps service recovery separate from unresolved backup incidents", () => {
  const issues = [
    { number: 1, state: "open", user: { type: "Bot" }, body: marker },
    { number: 2, state: "open", user: { type: "Bot" }, body: backupMarker },
  ];
  expect(incidentDecision(true, issues).close).toEqual([1]);
  expect(incidentDecision(true, issues, backupMarker).close).toEqual([2]);
});
it("requires recent independent server heartbeat before recovery", () => {
  const now = Date.now(),
    monitor = {
      checks: [
        {
          source: "supabase-cron",
          checked_at: new Date(now - 720000).toISOString(),
          healthy: true,
          stale: false,
        },
      ],
    };
  expect(monitorHealthy(monitor, now)).toBe(false);
  monitor.checks[0].checked_at = new Date(now).toISOString();
  expect(monitorHealthy(monitor, now)).toBe(true);
});
