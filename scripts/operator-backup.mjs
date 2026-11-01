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
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";
let mcp;
let lockFile;
let ownsLock = false;
try {
  const directory = defaultVault(),
    key = vaultKey(directory);
  lockFile = path.join(directory, "backup.lock");
  if (fs.existsSync(lockFile)) {
    if (Date.now() - fs.statSync(lockFile).mtimeMs < 30 * 60000)
      throw Error("BACKUP_ALREADY_RUNNING");
    fs.unlinkSync(lockFile);
  }
  fs.writeFileSync(lockFile, String(process.pid), { flag: "wx", mode: 0o600 });
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
  if (ownsLock && lockFile && fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
}
