import fs from "node:fs";
import path from "node:path";
import {
  defaultVault,
  vaultKey,
  decryptBackup,
  digest,
} from "./lib/operator-vault.mjs";
import { wrapRecoveryKey, unwrapRecoveryKey } from "./lib/recovery-key.mjs";
import { verifyRestore } from "./lib/operator-restore.mjs";
let input = "",
  stage = "input";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 20000) throw Error("RECOVERY_INPUT_LIMIT");
}
try {
  const { passphrase, directory, selfTest = false } = JSON.parse(input);
  input = "";
  stage = "destination";
  if (
    typeof passphrase !== "string" ||
    passphrase.length < 20 ||
    passphrase.length > 200
  )
    throw Error("RECOVERY_PASSPHRASE_REQUIRED");
  if (!path.isAbsolute(directory) || !fs.statSync(directory).isDirectory())
    throw Error("RECOVERY_DIRECTORY_REQUIRED");
  if (process.argv[2] === "prepare") {
    stage = "latest-backup";
    const vault = defaultVault(),
      latest = JSON.parse(
        fs.readFileSync(path.join(vault, "latest-status.json"), "utf8"),
      );
    if (
      !latest.verified ||
      !/^\d{4}-\d{2}-\d{2}T[\d-]+Z\.bfbak$/.test(latest.file) ||
      Date.now() - Date.parse(latest.checkedAt) > 48 * 3600000
    )
      throw Error("RECENT_VERIFIED_BACKUP_REQUIRED");
    stage = "decrypt";
    const key = vaultKey(vault),
      raw = fs.readFileSync(path.join(vault, latest.file), "utf8"),
      backup = decryptBackup(raw, key);
    stage = "restore";
    const verified = await verifyRestore(backup);
    stage = "write-kit";
    const folder = path.join(
      directory,
      "Bookforest-Recovery-" + new Date().toISOString().replace(/[:.]/g, "-"),
    );
    fs.mkdirSync(folder, { mode: 0o700 });
    fs.writeFileSync(path.join(folder, "backup.bfbak"), raw, {
      flag: "wx",
      mode: 0o600,
    });
    const guard = path.join(vault, "privacy-current.bfguard");
    if (!fs.existsSync(guard)) throw Error("PRIVACY_CHECKPOINT_REQUIRED");
    fs.copyFileSync(guard, path.join(folder, "privacy-current.bfguard"));
    const wrapped = wrapRecoveryKey(key, passphrase);
    if (digest(unwrapRecoveryKey(wrapped, passphrase)) !== digest(key))
      throw Error("RECOVERY_KEY_VERIFY_FAILED");
    fs.writeFileSync(path.join(folder, "recovery.bfkey"), wrapped, {
      flag: "wx",
      mode: 0o600,
    });
    fs.writeFileSync(
      path.join(folder, "receipt.json"),
      JSON.stringify(
        {
          ...verified,
          format: "bookforest-recovery-kit",
          createdAt: new Date().toISOString(),
          externalServices: [
            "Supabase Auth settings",
            "Google OAuth credentials and callbacks",
            "Vercel environment variables",
            "private Google Drive files",
          ],
        },
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );
    if (!selfTest)
      fs.writeFileSync(
        path.join(vault, "recovery-custody.json"),
        JSON.stringify({
          source: "operator-tool",
          destinationDigest: digest(path.resolve(directory)),
          preparedAt: new Date().toISOString(),
          backupDigest: verified.digest,
          portableKeyVerified: true,
          offDeviceConfirmed: false,
        }),
        { mode: 0o600 },
      );
    console.log(
      "Encrypted recovery kit prepared. Keep the passphrase separately. Verify on another PC before claiming off-device recovery.",
    );
  } else if (process.argv[2] === "verify") {
    const key = unwrapRecoveryKey(
      fs.readFileSync(path.join(directory, "recovery.bfkey"), "utf8"),
      passphrase,
    );
    const backup = decryptBackup(
      fs.readFileSync(path.join(directory, "backup.bfbak"), "utf8"),
      key,
    );
    const guardFile = path.join(directory, "privacy-current.bfguard");
    if (!fs.existsSync(guardFile)) throw Error("PRIVACY_CHECKPOINT_REQUIRED");
    const verified = await verifyRestore(
      backup,
      decryptBackup(fs.readFileSync(guardFile, "utf8"), key),
    );
    console.log(
      JSON.stringify({
        ...verified,
        portableKeyVerified: true,
        externalAuthAndOAuthVerified: false,
      }),
    );
  } else throw Error("RECOVERY_MODE_REQUIRED");
} catch (e) {
  if (process.platform === "win32" && process.argv[2] === "prepare") {
    try {
      fs.writeFileSync(
        path.join(defaultVault(), "recovery-tool-status.json"),
        JSON.stringify({
          ok: false,
          stage,
          code: /^[A-Z0-9_]+$/.test(e?.message ?? "")
            ? e.message
            : "RECOVERY_KIT_FAILED",
          systemCode: /^[A-Z0-9_]+$/.test(e?.code ?? "") ? e.code : null,
          at: new Date().toISOString(),
        }),
        { mode: 0o600 },
      );
    } catch {}
  }
  console.error(
    /^[A-Z0-9_]+$/.test(e?.message ?? "") ? e.message : "RECOVERY_KIT_FAILED",
  );
  process.exitCode = 1;
}
