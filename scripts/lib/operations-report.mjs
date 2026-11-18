import { cloudHealth } from "./cloud-health.mjs";
export function operationsReport({
  sourceCommit,
  sourceVersion = "",
  localModified = false,
  health,
  backup,
  cloud,
  delivery,
  operator,
  checkedAt = new Date().toISOString(),
}) {
  const now = Date.parse(checkedAt),
    date = (v) =>
      typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null,
    fresh = (v) =>
      !!date(v?.checkedAt) && Math.abs(now - Date.parse(v.checkedAt)) < 120000,
    sha = (v) => (typeof v === "string" && /^[a-f0-9]{40}$/.test(v) ? v : null),
    version = (v) =>
      typeof v === "string" && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(v)
        ? v
        : null,
    number = (v) =>
      Number.isSafeInteger(v) && v >= 0 && v <= 100000000 ? v : null;
  const healthy =
    fresh(health) &&
    health?.status === "ok" &&
    health?.checks?.database === true &&
    health?.checks?.authentication === true;
  const requirements = [
    {
      id: "independent-copy",
      state:
        backup?.copies?.external && backup?.copies?.healthy
          ? "verified"
          : "setup-required",
    },
    {
      id: "independent-provider",
      state: cloud?.separateProvider === true ? "verified" : "setup-required",
    },
    {
      id: "alternate-operator",
      state:
        typeof operator?.activeOperators !== "number"
          ? "unverified"
          : operator.activeOperators >= 2
            ? "verified"
            : "person-action-required",
    },
    { id: "operational-cutover", state: "unverified" },
  ];
  return {
    format: "bookforest-operations-report",
    version: 1,
    checkedAt,
    source: {
      commit: sha(sourceCommit),
      version: version(sourceVersion),
      workingTreeModified: localModified,
      deployedCommit: sha(health?.commit),
      deployedSourceModified:
        typeof health?.sourceModified === "boolean"
          ? health.sourceModified
          : null,
      matches:
        !!sha(sourceCommit) &&
        health?.commit === sourceCommit &&
        (!sourceVersion || health?.version === sourceVersion) &&
        health?.sourceModified === false,
    },
    service: { healthy, version: version(health?.version) },
    backup: {
      healthy:
        fresh(backup) && backup?.healthy === true && backup?.code === "OK",
      code: /^[A-Z_]{1,80}$/.test(backup?.code ?? "")
        ? backup.code
        : "BACKUP_CHECK_UNAVAILABLE",
      verifiedAt: date(backup?.verifiedAt),
      copiesHealthy: fresh(backup) && backup?.copies?.healthy === true,
      externalCopy: backup?.copies?.external === true,
    },
    cloud: {
      healthy: cloudHealth(200, cloud, now).healthy,
      restoreVerified: cloud?.restoreVerified === true,
      storedAt: date(cloud?.storedAt),
      separateProvider: cloud?.separateProvider === true,
    },
    delivery: {
      configured: delivery?.configured === true,
      healthy: fresh(delivery) && delivery?.healthy === true,
      code: /^[A-Z_]{1,80}$/.test(delivery?.code ?? "")
        ? delivery.code
        : "DELIVERY_CHECK_UNAVAILABLE",
      notifiedAt: date(delivery?.notifiedAt),
    },
    operator: operator
      ? {
          activeOperators: number(operator.activeOperators),
          pendingInvitations: number(operator.pendingInvitations),
          recordedRehearsals: number(operator.recordedRehearsals),
        }
      : null,
    requirements,
    operationalCutoverVerified: false,
    containsSecrets: false,
  };
}
