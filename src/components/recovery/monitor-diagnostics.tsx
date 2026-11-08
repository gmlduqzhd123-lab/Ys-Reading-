import { formatOperationsDate } from "@/lib/operations";
type Entry = {
  checked_at: string;
  http_status: number | null;
  error_id: string | null;
  deployment_sha: string | null;
  stage: string;
  database_ms: number | null;
  authentication_ms: number | null;
};
export type MonitorDiagnostics = {
  asOf: string;
  recent: Entry[];
  failures: Entry[];
};
const labels: Record<string, string> = {
  ok: "정상",
  configuration: "연결 설정",
  database: "DB 응답",
  database_pool: "DB 연결 대기",
  database_transport: "DB 통신",
  authentication: "인증 서버",
  application: "앱 내부",
  platform: "호스팅 응답",
  timeout: "응답 시간 초과",
  unknown: "추가 확인 필요",
  rate_limit: "요청 한도 초과",
};
export function OperatorMonitorDiagnostics({
  state,
}: {
  state: MonitorDiagnostics | null;
}) {
  return (
    <section className="panel">
      <h2>서버 오류 진단 이력</h2>
      <p>
        정기 점검의 실패 구간·시간·배포 버전을 14일간 보관합니다. 학생 글과 오류
        원문은 수집하지 않습니다.
      </p>
      {!state ? (
        <p role="status">진단 이력을 읽지 못했어요.</p>
      ) : (
        <>
          <p>
            최근 검사:{" "}
            {state.recent[0]
              ? `${formatOperationsDate(state.recent[0].checked_at)} · ${labels[state.recent[0].stage] ?? "추가 확인 필요"}`
              : "다음 정기 점검을 기다리고 있어요."}
          </p>
          <details>
            <summary>최근 실패 진단 {state.failures.length}건</summary>
            {state.failures.map((x) => (
              <p key={x.checked_at}>
                {formatOperationsDate(x.checked_at)} ·{" "}
                {labels[x.stage] ?? "추가 확인 필요"} · HTTP{" "}
                {x.http_status ?? "응답 없음"} · DB {x.database_ms ?? "—"}ms /
                인증 {x.authentication_ms ?? "—"}ms · 배포{" "}
                {x.deployment_sha?.slice(0, 7) ?? "확인 불가"}
                {x.error_id && <> · 문의 번호 {x.error_id}</>}
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
