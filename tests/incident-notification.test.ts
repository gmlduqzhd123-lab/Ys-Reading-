import { it, expect } from "vitest";
import {
  incidentDecision,
  marker,
  monitorHealthy,
} from "../scripts/lib/incident-notification.mjs";
it("deduplicates bot owned notifications and never modifies user issues", () => {
  const issues = [
    { number: 1, state: "open", user: { type: "User" }, body: marker },
    { number: 2, state: "open", user: { type: "Bot" }, body: marker },
  ];
  expect(incidentDecision(false, issues)).toEqual({ create: false, close: [] });
  expect(incidentDecision(true, issues)).toEqual({ create: false, close: [2] });
  expect(incidentDecision(false, []).create).toBe(true);
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
