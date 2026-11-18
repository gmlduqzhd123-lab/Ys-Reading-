import { it, expect } from "vitest";
import { operationsReport } from "../scripts/lib/operations-report.mjs";
it("does not accept stale health observations as current success", () => {
  const r = operationsReport({
    sourceCommit: null,
    health: {
      checkedAt: "2000-01-01T00:00:00Z",
      status: "ok",
      checks: { database: true, authentication: true },
    },
    backup: null,
    cloud: null,
    delivery: null,
    operator: null,
  });
  expect(r.service.healthy).toBe(false);
});
it("distinguishes implementation, source deployment, same-PC copies and actual operator readiness", () => {
  const r = operationsReport({
    sourceCommit: "a".repeat(40),
    health: {
      checkedAt: new Date().toISOString(),
      sourceModified: false,
      status: "ok",
      commit: "b".repeat(40),
      checks: { database: true, authentication: true },
    },
    backup: {
      healthy: true,
      code: "OK",
      copies: { healthy: true, external: false },
    },
    cloud: { healthy: true, restoreVerified: true, separateProvider: false },
    delivery: {
      configured: true,
      healthy: false,
      code: "GITHUB_CHECK_DELAYED",
    },
    operator: {
      activeOperators: 1,
      pendingInvitations: 1,
      recordedRehearsals: 0,
    },
  });
  expect(r.service.healthy).toBe(true);
  expect(r.source.matches).toBe(false);
  expect(r.requirements.find((x) => x.id === "independent-copy")?.state).toBe(
    "setup-required",
  );
  expect(r.requirements.find((x) => x.id === "alternate-operator")?.state).toBe(
    "person-action-required",
  );
  expect(r.operationalCutoverVerified).toBe(false);
});
it("does not invent successful checks or disclose raw upstream fields when results are missing", () => {
  const r = operationsReport({
    sourceCommit: null,
    health: null,
    backup: { code: "private token text", secret: "NEVER_RETURN" },
    cloud: null,
    delivery: null,
    operator: null,
  });
  expect(r.service.healthy).toBe(false);
  expect(r.delivery.healthy).toBe(false);
  expect(r.requirements.find((x) => x.id === "alternate-operator")?.state).toBe(
    "unverified",
  );
  expect(JSON.stringify(r)).not.toContain("NEVER_RETURN");
  expect(r.backup.code).toBe("BACKUP_CHECK_UNAVAILABLE");
});
