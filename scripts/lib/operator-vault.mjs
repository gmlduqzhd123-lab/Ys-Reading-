import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
export const projectRef = "rbtqtkjnqtcnljvabisa";
const aad = Buffer.from("bookforest-operator-backup-v1");
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  if (
    typeof value === "number" &&
    !Number.isSafeInteger(value) &&
    Number.isInteger(value)
  )
    throw Error("UNSAFE_BACKUP_INTEGER");
  return JSON.stringify(value);
}
export const digest = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export function encryptBackup(value, key) {
  if (key.length !== 32) throw Error("BACKUP_KEY_INVALID");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(canonical(value), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    format: "bookforest-operator-vault",
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  });
}
export function decryptBackup(raw, key) {
  const b = JSON.parse(raw);
  if (
    b.format !== "bookforest-operator-vault" ||
    b.version !== 1 ||
    Buffer.byteLength(raw) > 128 * 1024 * 1024
  )
    throw Error("BACKUP_FORMAT_INVALID");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(b.iv, "base64"),
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(b.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(b.data, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw Error("BACKUP_INTEGRITY_FAILED");
  }
}
export function protectLocalKey(key, unprotect = false) {
  if (process.platform !== "win32") throw Error("WINDOWS_ACCOUNT_REQUIRED");
  const ps = `Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${unprotect ? "Unprotect" : "Protect"}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result));`;
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    {
      input: key.toString("base64"),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  if (r.status !== 0) throw Error("WINDOWS_KEY_PROTECTION_FAILED");
  return Buffer.from(r.stdout.trim(), "base64");
}
export function defaultVault() {
  if (!process.env.USERPROFILE) throw Error("WINDOWS_PROFILE_REQUIRED");
  return path.join(
    process.env.USERPROFILE,
    "Documents",
    "Bookforest-OperatorBackups",
    projectRef,
  );
}
export function ensureVault(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    const identity = spawnSync("whoami.exe", [], {
      encoding: "utf8",
      windowsHide: true,
    }).stdout.trim();
    if (!identity) throw Error("WINDOWS_IDENTITY_REQUIRED");
    const r = spawnSync(
      "icacls.exe",
      [
        directory,
        "/inheritance:r",
        "/grant:r",
        identity + ":(OI)(CI)F",
        "*S-1-5-18:(OI)(CI)F",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (r.status !== 0) throw Error("BACKUP_FOLDER_ACL_FAILED");
  }
}
export function vaultKey(directory) {
  ensureVault(directory);
  const file = path.join(directory, "operator-key.dpapi");
  if (fs.existsSync(file)) return protectLocalKey(fs.readFileSync(file), true);
  const key = randomBytes(32);
  fs.writeFileSync(file, protectLocalKey(key), { flag: "wx", mode: 0o600 });
  return key;
}
