import { it, expect } from "vitest";
import { backupMonitorResult } from "../scripts/lib/backup-monitor-result.mjs";
const now = Date.now(),
  checkedAt = new Date(now).toISOString();
it("acknowledges a real delivered incident while preserving the failed backup health", () => {
  const b = { healthy: false, code: "BACKUP_PERMISSION_DENIED", checkedAt };
  expect(
    backupMonitorResult(b, { ...b, processed: true, incidentOpen: true }, now),
  ).toEqual({ ok: true, state: "incident-open", backupHealthy: false });
  expect(b.healthy).toBe(false);
});
it("fails monitoring for missing, stale, mismatched or undelivered receipts and unknown probes", () => {
  const b = { healthy: false, code: "BACKUP_AUTH_REQUIRED", checkedAt };
  for (const n of [
    null,
    { ...b, processed: true, incidentOpen: false },
    {
      ...b,
      processed: true,
      incidentOpen: true,
      checkedAt: new Date(now - 121000).toISOString(),
    },
    { ...b, processed: true, incidentOpen: true, healthy: true },
  ])
    expect(backupMonitorResult(b, n, now).ok).toBe(false);
  const unavailable = { ...b, code: "BACKUP_CHECK_UNAVAILABLE" };
  expect(
    backupMonitorResult(
      unavailable,
      { ...unavailable, processed: true, incidentOpen: true },
      now,
    ).ok,
  ).toBe(false);
});
