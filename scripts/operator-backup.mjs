import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { nativeMcp } from "./lib/native-mcp.mjs";
import {
  projectRef,
  defaultVault,
  vaultKey,
  encryptBackup,
  decryptBackup,
} from "./lib/operator-vault.mjs";
import { prepareBackup, verifyRestore } from "./lib/operator-restore.mjs";
import { acquireBackupLock } from "./lib/backup-lock.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";
let mcp;
let projectVerified = false;
let lockFile;
let ownsLock = false;
let releaseLock;
const attemptId = randomUUID(),
  attemptStarted = new Date().toISOString();
let attemptDirectory;
const pendingFile = () => path.join(attemptDirectory, "pending-attempts.json");
async function receipt(row) {
  if (!projectVerified) throw Error("PROJECT_SCOPE_MISMATCH");
  const sql = `insert into private.backup_attempts(id,started_at,finished_at,status,error_code) values(${quote(row.id)},${quote(row.started)},${row.finished ? quote(row.finished) : "null"},${quote(row.status)},${row.code ? quote(row.code) : "null"}) on conflict(id) do update set finished_at=excluded.finished_at,status=excluded.status,error_code=excluded.error_code;`;
  await mcp.call("execute_sql", { query: sql });
}
try {
  const directory = defaultVault(),
    key = vaultKey(directory);
  attemptDirectory = directory;
  lockFile = path.join(directory, "backup.lock");
  releaseLock = acquireBackupLock(lockFile);
  ownsLock = true;
  const input = process.argv.find((s) => s.startsWith("--verify="));
  let backup, file;
  if (input) {
    file = path.resolve(input.slice("--verify=".length));
    if (!file.startsWith(directory + path.sep) || !file.endsWith(".bfbak"))
      throw Error("BACKUP_PATH_INVALID");
    backup = decryptBackup(fs.readFileSync(file, "utf8"), key);
  } else {
    mcp = await nativeMcp();
    const check = await mcp.call("get_project_url", {});
    const url =
      typeof check === "string" ? check : (check?.url ?? check?.project_url);
    if (url !== `https://${projectRef}.supabase.co`)
      throw Error("PROJECT_SCOPE_MISMATCH");
    projectVerified = true;
    if (fs.existsSync(pendingFile())) {
      const pending = JSON.parse(fs.readFileSync(pendingFile(), "utf8"));
      for (const event of pending) await receipt(event);
      fs.unlinkSync(pendingFile());
    }
    await receipt({
      id: attemptId,
      started: attemptStarted,
      status: "running",
    });
    const rows = await mcp.call("execute_sql", {
      query: fs.readFileSync(
        path.join(repo, "scripts/operator-snapshot.sql"),
        "utf8",
      ),
    });
    const snapshot = rows?.[0]?.snapshot;
    if (!snapshot) throw Error("SNAPSHOT_READ_FAILED");
    const files = fs
      .readdirSync(path.join(repo, "supabase/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .map((name) => ({
        name,
        sql: fs.readFileSync(
          path.join(repo, "supabase/migrations", name),
          "utf8",
        ),
      }));
    backup = prepareBackup(snapshot, files);
    const privacyRows = await mcp.call("execute_sql", {
      query: "select private.operator_privacy_checkpoint() checkpoint",
    });
    if (!privacyRows?.[0]?.checkpoint)
      throw Error("PRIVACY_CHECKPOINT_READ_FAILED");
    fs.writeFileSync(
      path.join(directory, "privacy-current.bfguard"),
      encryptBackup({ projectRef, checkpoint: privacyRows[0].checkpoint }, key),
      { mode: 0o600 },
    );
    file = path.join(
      directory,
      `${new Date().toISOString().replace(/[:.]/g, "-")}.bfbak`,
    );
    fs.writeFileSync(file, encryptBackup(backup, key), {
      flag: "wx",
      mode: 0o600,
    });
  }
  const restored = await verifyRestore(
    decryptBackup(fs.readFileSync(file, "utf8"), key),
    fs.existsSync(path.join(directory, "privacy-current.bfguard"))
      ? decryptBackup(
          fs.readFileSync(
            path.join(directory, "privacy-current.bfguard"),
            "utf8",
          ),
          key,
        )
      : null,
  );
  const report = {
    ...restored,
    file: path.basename(file),
    bytes: fs.statSync(file).size,
    projectRef,
  };
  fs.writeFileSync(
    file + ".verification.json",
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(directory, "latest-status.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  if (mcp)
    await mcp.call("execute_sql", {
      query: `insert into private.backup_runs(id,created_at,verified_at,file_name,bytes,table_count,row_count,snapshot_digest) values(${quote(randomUUID())},now(),now(),${quote(report.file)},${report.bytes},${report.tables},${report.rows},${quote(report.digest)});`,
    });
  if (mcp)
    await receipt({
      id: attemptId,
      started: attemptStarted,
      status: "completed",
      finished: new Date().toISOString(),
    });
  // Only completed archives older than 90 days are pruned; keep the newest seven.
  if (!input) {
    const archives = fs
      .readdirSync(directory)
      .filter((n) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.bfbak$/.test(n),
      )
      .sort()
      .reverse();
    for (const name of archives.slice(7)) {
      const old = path.join(directory, name),
        proof = old + ".verification.json";
      if (
        Date.now() - fs.statSync(old).mtimeMs > 90 * 86400000 &&
        fs.existsSync(proof)
      ) {
        const verified = JSON.parse(fs.readFileSync(proof, "utf8"));
        if (verified.projectRef === projectRef && verified.verified) {
          fs.unlinkSync(old);
          fs.unlinkSync(proof);
        }
      }
    }
  }
  console.log(
    JSON.stringify({
      ok: true,
      file,
      verified: true,
      tables: report.tables,
      rows: report.rows,
      foreignKeys: report.foreignKeys,
      policies: report.policies,
    }),
  );
} catch (error) {
  const code = /^[A-Z0-9_]+$/.test(error.message ?? "")
    ? error.message
    : "BACKUP_FAILED";
  if (ownsLock && attemptDirectory) {
    const event = {
      id: attemptId,
      started: attemptStarted,
      finished: new Date().toISOString(),
      status: "failed",
      code,
    };
    try {
      if (mcp && projectVerified) await receipt(event);
      else throw Error();
    } catch {
      try {
        const pending = fs.existsSync(pendingFile())
          ? JSON.parse(fs.readFileSync(pendingFile(), "utf8"))
          : [];
        fs.writeFileSync(
          pendingFile(),
          JSON.stringify([...pending.slice(-29), event]),
          { mode: 0o600 },
        );
      } catch {}
    }
  }
  try {
    const directory = defaultVault();
    if (ownsLock && fs.existsSync(directory))
      fs.writeFileSync(
        path.join(directory, "latest-status.json"),
        JSON.stringify({
          ok: false,
          code,
          checkedAt: new Date().toISOString(),
        }),
        { mode: 0o600 },
      );
  } catch {}
  console.error(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
} finally {
  mcp?.close();
  releaseLock?.();
}
