import Link from "next/link";
import { formatOperationsDate } from "@/lib/operations";
export interface BackupState {
  asOf: string;
  health?: { healthy: boolean; code: string; agentCheckedAt: string | null; agentState: string | null };
  attempts?: {
    id: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    error_code: string | null;
  }[];
  runs: {
    id: string;
    created_at: string;
    verified_at: string;
    file_name: string;
    bytes: number;
    table_count: number;
    row_count: number;
    snapshot_digest: string;
  }[];
}
export function OperatorBackupStatus({ state }: { state: BackupState | null }) {
  const latest = state?.runs[0],
    stale =
      !latest ||
      !state ||
      Date.parse(state.asOf) - Date.parse(latest.verified_at) > 48 * 3600000;
  return (
    <section className="panel">
      <span className="eyebrow">OPERATOR RECOVERY</span>
      <h2>운영자 전체 자료 백업</h2>
      <p>
        선택한 운영자 PC에 계정·권한·학습 기록·경제 원장을 암호화해 보관합니다.
        백업 파일을 다시 복호화하고 별도 PostgreSQL 환경에 복원해 내용·관계·접근
        권한을 확인한 기록만 표시해요.
      </p>
      {state?.health?.agentCheckedAt && (
        <p role="status">
          자동 연결 점검 · {formatOperationsDate(state.health.agentCheckedAt)} · {state.health.code === "BACKUP_AUTH_REQUIRED"
            ? "Supabase 연결 재인증이 필요해요. 운영자 PC에서 Codex의 Supabase MCP를 다시 연결해 주세요."
            : state.health.code === "BACKUP_RETRY_WAIT" ? "연결을 재시도하고 있어요."
            : state.health.code === "BACKUP_RECOVERY_PENDING" ? "연결 회복 후 새 백업을 검증하고 있어요."
            : state.health.healthy ? "정상" : "백업 상태를 확인해 주세요."}
        </p>
      )}
      {state?.attempts?.[0] && (
        <p role="status">
          최근 실행:{" "}
          {state.attempts[0].status === "failed"
            ? "백업 실패 · 운영자 PC에서 원인을 확인해 주세요."
            : state.attempts[0].status === "running"
              ? Date.parse(state.asOf) -
                  Date.parse(state.attempts[0].started_at) >
                30 * 60000
                ? "백업 실행 신호가 오래됐어요."
                : "백업·복원 검사 중"
              : "백업·복원 검사 완료"}{" "}
          · {formatOperationsDate(state.attempts[0].started_at)}
        </p>
      )}
      <p>
        운영자 PC에서 매일 19시에 백업하며 로그인·연결 회복 시 누락분을 실행합니다.
        연결은 매시간 점검하고, 실패하면 15~60분 간격으로 재시도합니다. PC가 켜져 있고 운영자
        Windows 계정이 로그인돼 있어야 하며, Codex 연결 인증이 만료되면 재인증이
        필요해요. 복구 키를 별도 암호로 내보내 다른 기기에서 복원할 수 있습니다.
        복구 키 파일과 암호는 서로 다른 안전한 장소에 보관해 주세요.
      </p>
      <p className="notice" role="status">
        {!state
          ? "백업 상태를 읽지 못했어요. 운영자 PC의 백업 도구를 확인해 주세요."
          : !latest
            ? "아직 검증된 전체 백업 기록이 없어요."
            : stale
              ? "최근 검증 후 48시간이 지났어요. 운영자 PC의 백업 작업을 확인해 주세요."
              : `전체 자료 복원 검사 확인 · ${formatOperationsDate(latest.verified_at)}`}
      </p>
      {latest && (
        <p>
          암호화 파일 {(latest.bytes / 1024 / 1024).toFixed(2)}MB · 테이블{" "}
          {latest.table_count}개 · 기록 {latest.row_count}건
        </p>
      )}
      <p>
        Google Drive에 저장한 파일·외부 서비스 관리 설정은 별도입니다. 로그인
        세션은 복원하지 않으며 계정은 다시 로그인해야 해요. 운영 DB를 이
        화면에서 되돌리지 않습니다.
      </p>
      <p>
        <Link href="/guide#operator-backup">전체 백업 범위와 운영 방법 →</Link>
      </p>
      <details>
        <summary>최근 백업 확인 이력</summary>
        {state?.runs.map((r) => (
          <p key={r.id}>
            {formatOperationsDate(r.verified_at)} · {r.file_name} ·{" "}
            {r.table_count}개 테이블·{r.row_count}건
          </p>
        ))}
      </details>
    </section>
  );
}
