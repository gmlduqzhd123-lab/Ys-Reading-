import { it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { acquireBackupLock } from "../scripts/lib/backup-lock.mjs";
let folders: string[] = [];
function file() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "bookforest-lock-"));
  folders.push(d);
  return path.join(d, "backup.lock");
}
afterEach(() => {
  for (const d of folders) {
    for (const f of fs.readdirSync(d)) fs.unlinkSync(path.join(d, f));
    fs.rmdirSync(d);
  }
  folders = [];
});
it("keeps an active backup locked even when its file is old", () => {
  const f = file(),
    release = acquireBackupLock(f);
  fs.utimesSync(f, new Date(0), new Date(0));
  expect(() => acquireBackupLock(f)).toThrow("BACKUP_ALREADY_RUNNING");
  release();
  expect(fs.existsSync(f)).toBe(false);
});
it("recovers a lock left by a terminated process without waiting thirty minutes", async () => {
  const f = file(),
    child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      stdio: "ignore",
      windowsHide: true,
    });
  await once(child, "spawn");
  const exited = once(child, "exit");
  child.kill();
  await exited;
  fs.writeFileSync(f, String(child.pid));
  const release = acquireBackupLock(f);
  expect(JSON.parse(fs.readFileSync(f, "utf8")).pid).toBe(process.pid);
  release();
});
it("does not remove a malformed lock or another owner replacement", () => {
  const f = file();
  fs.writeFileSync(f, "invalid");
  expect(() => acquireBackupLock(f)).toThrow("BACKUP_LOCK_INVALID");
  fs.unlinkSync(f);
  const release = acquireBackupLock(f);
  fs.writeFileSync(
    f,
    JSON.stringify({ pid: process.pid, nonce: "replacement" }),
  );
  release();
  expect(fs.existsSync(f)).toBe(true);
});
