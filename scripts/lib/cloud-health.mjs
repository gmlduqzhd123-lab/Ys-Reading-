const hour = 3600000;
const recent = (value, age, now) => Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 60000 && now - Date.parse(value) <= age;
// Creation and restore verification are separate guarantees. An unavailable or
// malformed endpoint must never turn into a successful check.
export function cloudHealth(status, d, now = Date.now()) {
  if (status !== 200 || !d || d.configured !== true || typeof d.healthy !== "boolean" || typeof d.restoreVerified !== "boolean" || !Number.isFinite(Date.parse(d.storedAt)) || Date.parse(d.storedAt)>now+60000)
    return { healthy: false, warning: false, code: "CLOUD_BACKUP_CHECK_UNAVAILABLE" };
  if (!d.healthy || !recent(d.storedAt,48*hour,now)) return { healthy: false, warning: false, code: "CLOUD_BACKUP_STALE" };
  if (d.restoreVerified && recent(d.verifiedAt, 48 * hour, now) && Date.parse(d.verifiedAt) >= Date.parse(d.storedAt) - 60000)
    return { healthy: true, warning: false, code: "OK" };
  // Allow the scheduled verifier time to return after a new server archive.
  if (now - Date.parse(d.storedAt) <= 2 * hour)
    return { healthy: true, warning: false, code: "CLOUD_RESTORE_PENDING" };
  return { healthy: false, warning: true, code: "CLOUD_RESTORE_OVERDUE" };
}
