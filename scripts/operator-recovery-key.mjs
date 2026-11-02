import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import {
  defaultVault,
  vaultKey,
  protectLocalKey,
  ensureVault,
} from "./lib/operator-vault.mjs";
import { wrapRecoveryKey, unwrapRecoveryKey } from "./lib/recovery-key.mjs";
try {
  const mode = process.argv[2];
  if (!["export", "import"].includes(mode)) throw Error("USE_EXPORT_OR_IMPORT");
  const fileArg = process.argv.find((v) => v.startsWith("--file="));
  if (!fileArg) throw Error("RECOVERY_FILE_REQUIRED");
  const file = path.resolve(fileArg.slice(7));
  if (!file.endsWith(".bfkey")) throw Error("RECOVERY_FILE_INVALID");
  const p = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$s=Read-Host 'Recovery passphrase (20+ characters)' -AsSecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}",
    ],
    {
      stdio: ["inherit", "pipe", "inherit"],
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (p.status !== 0) throw Error("RECOVERY_PROMPT_FAILED");
  const passphrase = p.stdout;
  if (passphrase.length < 20) throw Error("RECOVERY_PASSPHRASE_REQUIRED");
  const directory = defaultVault(),
    keyFile = path.join(directory, "operator-key.dpapi");
  if (mode === "export") {
    const key = vaultKey(directory);
    if (path.dirname(file) !== directory)
      throw Error("EXPORT_TO_OPERATOR_VAULT_REQUIRED");
    fs.writeFileSync(file, wrapRecoveryKey(key, passphrase), {
      flag: "wx",
      mode: 0o600,
    });
    if (
      !timingSafeEqual(
        unwrapRecoveryKey(fs.readFileSync(file, "utf8"), passphrase),
        key,
      )
    )
      throw Error("RECOVERY_VERIFY_FAILED");
    console.log(
      "Encrypted recovery key created. Store a copy and its passphrase separately from this PC.",
    );
  } else {
    const key = unwrapRecoveryKey(fs.readFileSync(file, "utf8"), passphrase);
    if (fs.existsSync(keyFile)) {
      if (!timingSafeEqual(vaultKey(directory), key))
        throw Error("EXISTING_KEY_MUST_NOT_BE_REPLACED");
    } else {
      ensureVault(directory);
      fs.writeFileSync(keyFile, protectLocalKey(key), {
        flag: "wx",
        mode: 0o600,
      });
    }
    console.log(
      "Recovery key imported for this Windows user. Verify a backup before switching service.",
    );
  }
} catch (e) {
  console.error(
    /^[A-Z0-9_]+$/.test(e.message) ? e.message : "RECOVERY_KEY_FAILED",
  );
  process.exitCode = 1;
}
