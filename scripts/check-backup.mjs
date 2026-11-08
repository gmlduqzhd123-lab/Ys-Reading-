import fs from "node:fs";
let healthy = false,
  code = "BACKUP_CHECK_UNAVAILABLE", warning=false;
try {
  const r = await fetch(
    "https://reading-blush-zeta.vercel.app/api/backup-health",
    { cache: "no-store", signal: AbortSignal.timeout(12000) },
  );
  const d = await r.json(),
    at = Date.parse(d.checkedAt);
  const codes = [
    "OK",
    "BACKUP_MISSING",
    "BACKUP_STALE",
    "BACKUP_AUTH_REQUIRED",
    "BACKUP_FAILED",
    "BACKUP_STALLED",
    "BACKUP_RETRY_WAIT",
    "BACKUP_RECOVERY_PENDING",
    "BACKUP_AGENT_MISSING",
    "BACKUP_AGENT_OFFLINE",
  ];
  if (codes.includes(d.code)) code = d.code;
  healthy =
    r.ok &&
    d.healthy === true &&
    code === "OK" &&
    Number.isFinite(at) &&
    Math.abs(Date.now() - at) < 120000;
  warning=r.ok && d.backupHealthy===true && ["BACKUP_AGENT_MISSING","BACKUP_AGENT_OFFLINE"].includes(code) && Number.isFinite(at) && Math.abs(Date.now()-at)<120000;
} catch {}
const result = { healthy, warning, code, checkedAt: new Date().toISOString() };
fs.writeFileSync("backup-result.json", JSON.stringify(result));
console.log(JSON.stringify(result));
// A silent PC needs attention; a still-verified backup is not a failed backup.
process.exitCode = healthy || warning ? 0 : 1;
