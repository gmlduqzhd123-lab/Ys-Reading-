// Public, bounded health metadata only. Never include API responses or exception text.
export const marker = "<!-- bookforest-service-incident-v1 -->";
export const backupMarker = "<!-- bookforest-backup-incident-v1 -->";
export function incidentDecision(healthy, issues, selectedMarker = marker) {
  const owned = issues.filter(
    (i) =>
      i.state === "open" &&
      i.user?.type === "Bot" &&
      i.body?.startsWith(selectedMarker),
  );
  return {
    create: !healthy && owned.length === 0,
    close: healthy ? owned.map((i) => i.number) : [],
  };
}
export function monitorHealthy(monitor, now = Date.now()) {
  const c = monitor?.checks?.find((c) => c.source === "supabase-cron"),
    at = Date.parse(c?.checked_at);
  return Boolean(
    c?.healthy === true &&
    Number.isFinite(at) &&
    at <= now + 60000 &&
    now - at < 720000,
  );
}
