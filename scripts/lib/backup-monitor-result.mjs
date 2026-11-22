// A delivered, acknowledged backup incident is an operational warning, not an
// execution error of the monitoring workflow. The backup health stays false.
import { backupIncidentText } from "./incident-notification.mjs";
export function backupMonitorResult(backup, notification, now = Date.now()) {
  const fresh = (v) =>
    Number.isFinite(Date.parse(v?.checkedAt)) &&
    Math.abs(now - Date.parse(v.checkedAt)) < 120000;
  const unknown = new Set([
    "BACKUP_CHECK_UNAVAILABLE",
    "CLOUD_BACKUP_CHECK_UNAVAILABLE",
    "BACKUP_TASK_CHECK_UNAVAILABLE",
    "BACKUP_WATCHDOG_UNAVAILABLE",
  ]);
  if (
    !fresh(backup) ||
    !fresh(notification) ||
    typeof backup.healthy !== "boolean" ||
    notification.processed !== true ||
    notification.healthy !== backup.healthy ||
    notification.code !== backup.code
  )
    return { ok: false, state: "monitor-error" };
  if (backup.healthy) return { ok: true, state: "healthy" };
  if (
    notification.incidentOpen === true &&
    !unknown.has(backup.code) &&
    backupIncidentText(backup.code).code === backup.code
  )
    return { ok: true, state: "incident-open", backupHealthy: false };
  return { ok: false, state: "monitor-error", backupHealthy: false };
}
