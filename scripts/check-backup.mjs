import fs from "node:fs";
let healthy = false,
  code = "BACKUP_CHECK_UNAVAILABLE";
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
  ];
  if (codes.includes(d.code)) code = d.code;
  healthy =
    r.ok &&
    d.healthy === true &&
    code === "OK" &&
    Number.isFinite(at) &&
    Math.abs(Date.now() - at) < 120000;
} catch {}
const result = { healthy, code, checkedAt: new Date().toISOString() };
fs.writeFileSync("backup-result.json", JSON.stringify(result));
console.log(JSON.stringify(result));
process.exitCode = healthy ? 0 : 1;
