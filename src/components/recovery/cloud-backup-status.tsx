import { getSupabaseConfig } from "@/lib/supabase/config";
import { formatOperationsDate } from "@/lib/operations";
export async function CloudBackupStatus() {
  const c = getSupabaseConfig();
  let state: {
    configured: boolean;
    healthy: boolean;
    storedAt: string | null;
    verifiedAt: string | null;
  } | null = null;
  try {
    if (c) {
      const r = await fetch(
        c.url + "/rest/v1/rpc/service_cloud_backup_health",
        {
          method: "POST",
          headers: { apikey: c.key, "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        },
      );
      if (r.ok) state = await r.json();
    }
  } catch {}
  return (
    <section className="panel">
      <h2>PC와 독립된 암호화 서버 백업</h2>
      <p>
        서버 예약 작업이 하루 한 번 전체 자료를 공개키로 암호화하여 비공개
        저장소에 보관합니다. 운영자 PC와 MCP 인증이 없어도 파일 생성은
        계속됩니다.
      </p>
      <p role="status">
        {!state
          ? "서버 백업 상태를 확인하지 못했어요."
          : !state.configured
            ? "서버 백업 설정을 준비 중입니다."
            : state.healthy
              ? `암호화 파일 보관 확인 · ${formatOperationsDate(state.storedAt!)}`
              : "최근 48시간 안의 암호화 서버 백업을 확인해 주세요."}
      </p>
      <p>
        별도 PostgreSQL 복원 검사:{" "}
        {state?.verifiedAt
          ? formatOperationsDate(state.verifiedAt)
          : "아직 검증 기록 없음"}
      </p>
      <p className="form-help">
        파일 생성·읽기 대조와 DB 복원 검사는 별도로 표시합니다. 같은 Supabase
        프로젝트의 저장소이므로 제공자 전체 장애에 대비한 외부 사본과 실제 서버
        전환은 별도입니다. 복호화에는 기존 복구 키가 필요합니다.
      </p>
    </section>
  );
}
