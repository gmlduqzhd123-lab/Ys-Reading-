import fs from "node:fs";
import path from "node:path";
import {
  defaultVault,
  vaultKey,
  decryptBackup,
  digest,
  projectRef,
} from "./lib/operator-vault.mjs";
import { verifyRestore } from "./lib/operator-restore.mjs";
try {
  const directory = path.resolve(process.argv[2] ?? "");
  if (
    !path.basename(directory).startsWith("Bookforest-Recovery-") ||
    !fs.lstatSync(directory).isDirectory() ||
    fs.lstatSync(directory).isSymbolicLink()
  )
    throw Error("RECOVERY_KIT_DIRECTORY_REQUIRED");
  const receiptFile = path.join(directory, "receipt.json"),
    keyFile = path.join(directory, "recovery.bfkey"),
    backupFile = path.join(directory, "backup.bfbak");
  for (const file of [receiptFile, keyFile, backupFile])
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
      throw Error("RECOVERY_KIT_FILE_REQUIRED");
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8")),
    wrapped = fs.readFileSync(keyFile, "utf8"),
    keyMetadata = JSON.parse(wrapped);
  if (
    receipt.format !== "bookforest-recovery-kit" ||
    keyMetadata.format !== "bookforest-recovery-key" ||
    keyMetadata.projectRef !== projectRef
  )
    throw Error("RECOVERY_KIT_FORMAT_INVALID");
  const vault = defaultVault(),
    key = vaultKey(vault),
    old = decryptBackup(fs.readFileSync(backupFile, "utf8"), key);
  if (old.sha256 !== receipt.digest)
    throw Error("RECOVERY_KIT_CONTENT_MISMATCH");
  const latest = JSON.parse(
    fs.readFileSync(path.join(vault, "latest-status.json"), "utf8"),
  );
  if (
    !latest.verified ||
    !/^\d{4}-\d{2}-\d{2}T[\d-]+Z\.bfbak$/.test(latest.file)
  )
    throw Error("VERIFIED_BACKUP_REQUIRED");
  const raw = fs.readFileSync(path.join(vault, latest.file), "utf8"),
    verified = await verifyRestore(decryptBackup(raw, key));
  const next = backupFile + ".updating";
  fs.writeFileSync(next, raw, { flag: "wx", mode: 0o600 });
  fs.renameSync(next, backupFile);
  if (fs.readFileSync(keyFile, "utf8") !== wrapped)
    throw Error("RECOVERY_KEY_CHANGED");
  fs.writeFileSync(
    receiptFile,
    JSON.stringify(
      {
        ...receipt,
        ...verified,
        updatedAt: new Date().toISOString(),
        recoveryKeyFileDigest: digest(wrapped),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      updated: true,
      verified: true,
      tables: verified.tables,
      rows: verified.rows,
      recoveryKeyUnchanged: true,
    }),
  );
} catch (e) {
  console.error(
    /^[A-Z0-9_]+$/.test(e?.message ?? "")
      ? e.message
      : "RECOVERY_KIT_REFRESH_FAILED",
  );
  process.exitCode = 1;
}
