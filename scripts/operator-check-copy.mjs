import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  defaultVault,
  vaultKey,
  decryptBackup,
  projectRef,
} from "./lib/operator-vault.mjs";
import { validateCopyDirectory, copyLocationKind } from "./lib/backup-copy.mjs";
import { acquireBackupLock } from "./lib/backup-lock.mjs";
import { operatorTransport as nativeMcp } from "./lib/operator-transport.mjs";
const vault = defaultVault(),
  statusFile = path.join(vault, "copy-status.json");
let release, mcp;
try {
  if (!fs.existsSync(path.join(vault, "backup-copy.bfconfig"))) {
    console.log(JSON.stringify({ configured: false }));
    process.exit(0);
  }
  release = acquireBackupLock(path.join(vault, "copy.lock"));
  const key = vaultKey(vault),
    config = decryptBackup(
      fs.readFileSync(path.join(vault, "backup-copy.bfconfig"), "utf8"),
      key,
    );
  if (config.projectRef !== projectRef) throw Error("COPY_SCOPE_MISMATCH");
  validateCopyDirectory(config.directory, key);
  const child = spawnSync(
    process.execPath,
    [
      path.join(import.meta.dirname, "operator-refresh-recovery-kit.mjs"),
      config.directory,
    ],
    { windowsHide: true, encoding: "utf8", timeout: 120000, maxBuffer: 10000 },
  );
  if (child.status !== 0) throw Error("COPY_VERIFY_FAILED");
  const receipt = validateCopyDirectory(config.directory, key),
    kind = copyLocationKind(config.directory),
    at = new Date().toISOString();
  const proof = {
    verified: true,
    backup_digest: receipt.digest,
    location_kind: kind,
    verified_at: at,
    bytes: fs.statSync(path.join(config.directory, "backup.bfbak")).size,
    sourceCreatedAt:decryptBackup(fs.readFileSync(path.join(config.directory,"backup.bfbak"),"utf8"),key).createdAt,
    reported: false,
  };
  try {
    mcp = await nativeMcp();
    if (
      (await mcp.call("get_project_url", {}))?.url !==
      `https://${projectRef}.supabase.co`
    )
      throw Error("COPY_SCOPE_MISMATCH");
    await mcp.call("execute_sql", {
      query: `insert into private.backup_copy_checks values('${randomUUID()}','${at}','${receipt.digest}','${kind}',${proof.bytes});delete from private.backup_copy_checks where verified_at<now()-interval '90 days';`,
    });
    proof.reported = true;
  } catch {}
  fs.writeFileSync(statusFile, JSON.stringify(proof), { mode: 0o600 });
  console.log(
    JSON.stringify({
      configured: true,
      verified: true,
      locationKind: kind,
      reported: proof.reported,
    }),
  );
} catch (e) {
  const code = /^[A-Z_]+$/.test(e?.message ?? "")
    ? e.message
    : "COPY_CHECK_FAILED";
  fs.writeFileSync(
    statusFile,
    JSON.stringify({
      verified: false,
      code,
      checkedAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
  console.error(JSON.stringify({ configured: true, verified: false, code }));
  process.exitCode = 1;
} finally {
  mcp?.close();
  release?.();
}
