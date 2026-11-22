import fs from "node:fs";
import { backupMonitorResult } from "./lib/backup-monitor-result.mjs";
let result;
try {
  result = backupMonitorResult(
    JSON.parse(fs.readFileSync("backup-result.json", "utf8")),
    JSON.parse(fs.readFileSync("backup-notification-result.json", "utf8")),
  );
} catch {
  result = { ok: false, state: "monitor-error" };
}
console.log(JSON.stringify(result));
if (!result.ok) process.exitCode = 1;
