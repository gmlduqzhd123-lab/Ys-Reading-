// Keys/passphrases are accepted through private stdin, never command arguments.
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import {
  defaultVault,
  vaultKey,
  encryptBackup,
  decryptBackup,
  digest,
} from "./lib/operator-vault.mjs";
import { unwrapRecoveryKey } from "./lib/recovery-key.mjs";
import {
  recoverySettings,
  targetRecoverySettings,
} from "./lib/recovery-settings.mjs";
try {
  if (process.argv[2] === "export") {
    const directory = defaultVault(),
      key = vaultKey(directory),
      values = parseEnv(
        fs.readFileSync(
          path.resolve(import.meta.dirname, "../.env.local"),
          "utf8",
        ),
      );
    const bundle = recoverySettings(values),
      file = path.join(directory, "recovery-settings.bfsettings");
    fs.writeFileSync(file, encryptBackup(bundle, key), { mode: 0o600 });
    const readback = decryptBackup(fs.readFileSync(file, "utf8"), key);
    if (digest(readback.values) !== digest(bundle.values))
      throw Error("SETTINGS_VERIFY_FAILED");
    console.log(
      JSON.stringify({
        exported: true,
        encrypted: true,
        source: bundle.source,
        names: Object.keys(bundle.values),
      }),
    );
  } else if (["inspect", "prepare"].includes(process.argv[2])) {
    let input = "";
    for await (const c of process.stdin) {
      input += c;
      if (input.length > 30000) throw Error("SETTINGS_INPUT_LIMIT");
    }
    const v = JSON.parse(input);
    input = "";
    const key = unwrapRecoveryKey(
      fs.readFileSync(path.join(v.kitDirectory, "recovery.bfkey"), "utf8"),
      v.passphrase,
    );
    const bundle = decryptBackup(
      fs.readFileSync(
        path.join(v.kitDirectory, "recovery-settings.bfsettings"),
        "utf8",
      ),
      key,
    );
    if (process.argv[2] === "inspect") {
      if (bundle.format !== "bookforest-recovery-settings")
        throw Error("SETTINGS_FORMAT_INVALID");
      console.log(
        JSON.stringify({
          verified: true,
          exportedAt: bundle.exportedAt,
          source: bundle.source,
          names: Object.keys(bundle.values),
        }),
      );
    } else {
      const values = targetRecoverySettings(bundle, v.target),
        directory = path.resolve(v.target.directory);
      if (
        directory === path.resolve(import.meta.dirname, "..") ||
        !path.isAbsolute(v.target.directory)
      )
        throw Error("INDEPENDENT_DIRECTORY_REQUIRED");
      fs.mkdirSync(directory, { recursive: true });
      const file = path.join(directory, ".env.local");
      if (fs.existsSync(file) || fs.lstatSync(directory).isSymbolicLink())
        throw Error("TARGET_ENV_EXISTS");
      fs.writeFileSync(
        file,
        Object.entries(values)
          .map(([k, val]) => k + "=" + JSON.stringify(val))
          .join("\n") + "\n",
        { flag: "wx", mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          prepared: true,
          productionChanged: false,
          googleCallbacksRequireReview: true,
          names: Object.keys(values),
        }),
      );
    }
  } else throw Error("SETTINGS_MODE_REQUIRED");
} catch (e) {
  console.error(
    JSON.stringify({
      ok: false,
      code: /^[A-Z_]+$/.test(e?.message ?? "")
        ? e.message
        : "RECOVERY_SETTINGS_FAILED",
    }),
  );
  process.exitCode = 1;
}
