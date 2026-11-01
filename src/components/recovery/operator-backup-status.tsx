import Link from "next/link";
import { formatOperationsDate } from "@/lib/operations";
export interface BackupState {
  asOf: string;
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
