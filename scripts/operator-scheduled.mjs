import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { defaultVault, ensureVault } from "./lib/operator-vault.mjs";
const directory = defaultVault(),
  log = path.join(directory, "scheduled-status.json");
try {
  ensureVault(directory);
  const codex = process.argv.find((v) => v.startsWith("--codex="))?.slice(8);
  if (!codex || !fs.existsSync(codex)) throw Error("BACKUP_CODEX_UNAVAILABLE");
  fs.writeFileSync(
    log,
    JSON.stringify({
      ok: false,
      status: "running",
      checkedAt: new Date().toISOString(),
    }),
  );
  const r = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, "operator-backup.mjs")],
    {
      cwd: path.resolve(import.meta.dirname, ".."),
      env: { ...process.env, BOOKFOREST_CODEX_BINARY: codex },
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  let result;
  try {
    result = JSON.parse(
      String(r.stdout || r.stderr)
        .trim()
        .split(/\r?\n/)
        .at(-1),
    );
  } catch {}
  const ok = r.status === 0 && result?.ok === true && result.verified === true;
  fs.writeFileSync(
    log,
    JSON.stringify({
      ok,
      status: ok ? "completed" : "failed",
      checkedAt: new Date().toISOString(),
      code: ok
        ? null
        : /^[A-Z][A-Z0-9_]{1,79}$/.test(result?.code ?? "")
          ? result.code
          : "BACKUP_RUN_FAILED",
      verified: ok,
      tables: ok ? result.tables : null,
      rows: ok ? result.rows : null,
      foreignKeys: ok ? result.foreignKeys : null,
      policies: ok ? result.policies : null,
    }),
  );
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  const code = /^BACKUP_[A-Z_]+$/.test(e?.message ?? "")
    ? e.message
    : "BACKUP_RUNNER_UNAVAILABLE";
  try {
    fs.writeFileSync(
      log,
      JSON.stringify({
        ok: false,
        status: "failed",
        checkedAt: new Date().toISOString(),
        code,
      }),
    );
  } catch {}
  process.exitCode = 1;
}
