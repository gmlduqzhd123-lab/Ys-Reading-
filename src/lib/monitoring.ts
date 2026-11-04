export type MonitorState = {
  asOf: string;
  checks: {
    source: string;
    checked_at: string;
    healthy: boolean;
    code: string;
    stale: boolean;
  }[];
  incidents: {
    source: string;
    opened_at: string;
    closed_at: string | null;
    code: string;
  }[];
};
export const monitorMaxAge = 12 * 60 * 1000;
export function monitorCheckStale(
  check: { checked_at: string },
  now = Date.now(),
) {
  const at = Date.parse(check.checked_at);
  return !Number.isFinite(at) || at > now + 60000 || now - at >= monitorMaxAge;
}
export function refreshMonitor(
  v: MonitorState | null,
  now = Date.now(),
): MonitorState | null {
  if (!v || !Array.isArray(v.checks) || !Array.isArray(v.incidents))
    return null;
  return {
    ...v,
    checks: v.checks.map((c) => ({ ...c, stale: monitorCheckStale(c, now) })),
  };
}
export function monitorLabel(v: MonitorState | null, now = Date.now()) {
  const check = v?.checks.find((c) => c.source === "supabase-cron");
  return !check
    ? "서버 정기 점검 준비 중"
    : monitorCheckStale(check, now)
      ? "서버 정기 점검 신호가 오래됐어요"
      : check.healthy
        ? "서버 정기 점검 정상"
        : "서버 정기 점검에서 문제를 발견했어요";
}
