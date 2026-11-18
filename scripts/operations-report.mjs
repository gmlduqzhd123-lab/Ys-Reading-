import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { operationsReport } from "./lib/operations-report.mjs";
const base = "https://reading-blush-zeta.vercel.app",
  root = path.resolve(import.meta.dirname, "..");
const results = await Promise.allSettled(
  [
    "health?deep=1",
    "backup-health",
    "cloud-backup-health",
    "delivery-health",
  ].map(async (p) => {
    const r = await fetch(base + "/api/" + p, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw Error("CHECK_UNAVAILABLE");
    return r.json();
  }),
);
const [health, backup, cloud, delivery] = results.map((r) =>
  r.status === "fulfilled" ? r.value : null,
);
let sourceCommit = null;
try {
  const v = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (/^[a-f0-9]{40}$/.test(v)) sourceCommit = v;
} catch {}
let operator = null;
if (process.argv.includes("--operator")) {
  let m;
  try {
    const { operatorTransport } = await import("./lib/operator-transport.mjs");
    m = await operatorTransport();
    if (
      (await m.call("get_project_url", {}))?.url !==
      "https://rbtqtkjnqtcnljvabisa.supabase.co"
    )
      throw Error("PROJECT_SCOPE_MISMATCH");
    operator = (
      await m.call("execute_sql", {
        query:
          'select(select count(*) from private.operators o join public.profiles p on p.id=o.user_id where p.account_active) as "activeOperators",(select count(*) from private.operator_email_invitations where claimed_at is null and expires_at>now()) as "pendingInvitations",(select count(*) from private.recovery_rehearsals) as "recordedRehearsals"',
      })
    )[0];
  } catch {
    operator = null;
  } finally {
    m?.close();
  }
}
let localModified = false;
try {
  localModified = !!execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
} catch {
  localModified = true;
}
const sourceVersion = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
).version;
const report = operationsReport({
  sourceCommit,
  sourceVersion,
  localModified,
  health,
  backup,
  cloud,
  delivery,
  operator,
});
const pos = process.argv.indexOf("--out"),
  target =
    pos >= 0
      ? path.resolve(process.argv[pos + 1] ?? "operations-report.json")
      : path.join(root, "operations-report.json");
fs.writeFileSync(target, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    report: target,
    serviceHealthy: report.service.healthy,
    backupHealthy: report.backup.healthy,
    sourceMatches: report.source.matches,
    requirements: report.requirements.map((x) => ({
      id: x.id,
      state: x.state,
    })),
  }),
);
if (
  process.argv.includes("--require-current") &&
  (!report.source.matches ||
    !report.service.healthy ||
    !report.backup.healthy ||
    !report.cloud.restoreVerified)
)
  process.exitCode = 1;
