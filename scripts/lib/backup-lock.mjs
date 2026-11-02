import fs from "node:fs";
import { randomUUID } from "node:crypto";
export function acquireBackupLock(file) {
  if (fs.existsSync(file)) {
    let pid;
    try {
      const text = fs.readFileSync(file, "utf8").trim(),
        v = JSON.parse(text);
      pid = typeof v === "number" ? v : v.pid;
    } catch {
      throw Error("BACKUP_LOCK_INVALID");
    }
    if (!Number.isSafeInteger(pid) || pid < 1)
      throw Error("BACKUP_LOCK_INVALID");
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (e) {
      if (e.code === "ESRCH") alive = false;
    }
    if (alive) throw Error("BACKUP_ALREADY_RUNNING");
    fs.unlinkSync(file);
  }
  const own = JSON.stringify({ pid: process.pid, nonce: randomUUID() });
  fs.writeFileSync(file, own, { flag: "wx", mode: 0o600 });
  return () => {
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === own)
      fs.unlinkSync(file);
  };
}
