import { getSupabaseConfig } from "@/lib/supabase/config";
import { formatOperationsDate } from "@/lib/operations";
import { backupIncidentText } from "../../../scripts/lib/incident-notification.mjs";
export async function BackupHealthSummary() {
  let backup: any = null,
    cloud: any = null;
  try {
    const c = getSupabaseConfig();
    if (c) {
      [backup, cloud] = await Promise.all(
        ["service_backup_health", "service_cloud_backup_health"].map(
          async (name) => {
            const r = await fetch(c.url + "/rest/v1/rpc/" + name, {
              method: "POST",
              headers: { apikey: c.key, "Content-Type": "application/json" },
              body: "{}",
              cache: "no-store",
              signal: AbortSignal.timeout(5000),
            });
            return r.ok ? r.json() : null;
          },
        ),
      );
    }
  } catch {}
  return (
    <section className="panel">
      <h2>백업·복원 검증 상태</h2>
      <p role="status">
        {!backup
          ? "백업 상태를 확인하지 못했어요."
          : backup.healthy
            ? "PC 전체 백업과 연결 점검이 정상입니다."
            : backupIncidentText(backup.code).text}
      </p>
      {backup?.verifiedAt && (
        <p>
          마지막 PC 백업 복원 검증: {formatOperationsDate(backup.verifiedAt)}
        </p>
      )}
      <p>
        {!cloud
          ? "서버 백업 상태를 확인하지 못했어요."
          : cloud.restoreVerified
            ? "최신 서버 암호화 백업의 복원 검증을 확인했습니다."
            : cloud.healthy
              ? "서버 암호화 백업은 생성됐으며, 최신 파일의 복원 검증을 기다립니다."
              : "최신 서버 백업을 다시 확인해야 합니다."}
      </p>
      <p className="form-help">
        GitHub의 점검 실행 성공과 백업의 정상 여부를 구분합니다. 같은 백업
        장애는 운영 이슈 하나로 관리하며, 검증이 끝나기 전에는 복구 완료로
        표시하지 않습니다.
      </p>
    </section>
  );
}
