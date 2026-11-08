import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { decryptBackup, projectRef } from "./operator-vault.mjs";
export function validateCopyDirectory(directory, key) {
  if (
    !path.isAbsolute(directory) ||
    !fs.statSync(directory).isDirectory() ||
    fs.lstatSync(directory).isSymbolicLink()
  )
    throw Error("COPY_DIRECTORY_REQUIRED");
  for (const name of ["backup.bfbak", "receipt.json", "recovery.bfkey"]) {
    const p = path.join(directory, name);
    if (!fs.statSync(p).isFile() || fs.lstatSync(p).isSymbolicLink())
      throw Error("COPY_KIT_REQUIRED");
  }
  const receipt = JSON.parse(
    fs.readFileSync(path.join(directory, "receipt.json"), "utf8"),
  );
  const wrapped = JSON.parse(
    fs.readFileSync(path.join(directory, "recovery.bfkey"), "utf8"),
  );
  const backup = decryptBackup(
    fs.readFileSync(path.join(directory, "backup.bfbak"), "utf8"),
    key,
  );
  if (
    receipt.format !== "bookforest-recovery-kit" ||
    wrapped.projectRef !== projectRef ||
    backup.projectRef !== projectRef ||
    receipt.digest !== backup.sha256
  )
    throw Error("COPY_KIT_MISMATCH");
  return receipt;
}
export function copyLocationKind(directory) {
  let resolved = fs.realpathSync(directory);
  if (resolved.startsWith("\\\\?\\UNC\\")) return "network";
  if (resolved.startsWith("\\\\?\\")) resolved = resolved.slice(4);
  if (resolved.startsWith("\\\\")) return "network";
  if (process.platform !== "win32") return "same_pc";
  const root = path.parse(resolved).root,
    system = path.parse(process.env.USERPROFILE || resolved).root;
  if (root.toLowerCase() === system.toLowerCase()) return "same_pc";
  const letter = root[0];
  if (!/^[a-z]$/i.test(letter)) return "other_volume";
  const script = `$d=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${letter}:'"; if($d.DriveType -eq 2){'external'}elseif($d.DriveType -eq 4){'network'}else{ $b=Get-Partition -DriveLetter '${letter}' -ErrorAction SilentlyContinue|Get-Disk -ErrorAction SilentlyContinue; if($b.BusType -eq 'USB'){'external'}else{'unknown'} }`;
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, encoding: "utf8", timeout: 10000 },
  );
  return r.stdout?.trim() === "external"
    ? "removable"
    : r.stdout?.trim() === "network"
      ? "network"
      : "other_volume";
}
export function copyFreshness(copy, latestDigest, now = Date.now()) {
  if (!copy) return "missing";
  if (!["removable", "network"].includes(copy.location_kind))
    return "local_only";
  const at = Date.parse(copy.verified_at);
  return copy.backup_digest === latestDigest &&
    Number.isFinite(at) &&
    at <= now + 60000 &&
    now - at < 48 * 3600000
    ? "fresh"
    : "stale";
}
