import fs from "node:fs";
import path from "node:path";
import {
  defaultVault,
  vaultKey,
  encryptBackup,
  projectRef,
} from "./lib/operator-vault.mjs";
import { validateCopyDirectory, copyLocationKind } from "./lib/backup-copy.mjs";
try {
  const directory = path.resolve(process.argv[2] || ""),
    vault = defaultVault(),
    key = vaultKey(vault);
  validateCopyDirectory(directory, key);
  fs.writeFileSync(
    path.join(vault, "backup-copy.bfconfig"),
    encryptBackup({ projectRef, directory }, key),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      configured: true,
      locationKind: copyLocationKind(directory),
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      configured: false,
      code: "COPY_KIT_OR_DIRECTORY_INVALID",
    }),
  );
  process.exitCode = 1;
}
