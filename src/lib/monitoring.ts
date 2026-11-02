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
export function monitorLabel(v: MonitorState | null) {
  const check = v?.checks.find((c) => c.source === "supabase-cron");
  return !check
    ? "서버 정기 점검 준비 중"
    : check.stale
      ? "서버 정기 점검 신호가 오래됐어요"
      : check.healthy
        ? "서버 정기 점검 정상"
        : "서버 정기 점검에서 문제를 발견했어요";
}
