// Public, bounded health metadata only. Never include API responses or exception text.
export const marker = "<!-- bookforest-service-incident-v1 -->";
export const backupMarker = "<!-- bookforest-backup-incident-v1 -->";
export function backupIncidentText(code) {
  const reasons = {
    BACKUP_COPY_FAILED:"암호화 백업 사본 복사에 실패했습니다. 운영자 PC에서 저장 장치·네트워크 폴더 연결과 여유 공간을 확인해 주세요. 원본 백업 성공과 별도로 사본을 다시 검증해야 합니다.",
    BACKUP_COPY_STALE:"설정된 백업 사본의 보고가 오래됐거나 최신 파일 검증을 확인하지 못했습니다. 운영자 PC의 예약 작업과 저장 장치 연결을 확인해 주세요.",
    CLOUD_RESTORE_OVERDUE: "서버에 암호화 백업은 있지만 최신 파일의 복원 검증이 2시간 이상 지연되었습니다. 운영자 PC의 전원·MCP 인증·예약 복원 검사 결과를 확인해 주세요. 생성 성공을 복원 성공으로 처리하지 않습니다.",
    CLOUD_BACKUP_STALE: "서버의 독립 암호화 백업을 확인하지 못했습니다. Supabase 예약 작업·백업 작업자·비공개 저장소 상태를 확인해 주세요. PC 백업의 복원 검증과 별도 점검입니다.",
    CLOUD_BACKUP_CHECK_UNAVAILABLE: "독립 서버 백업의 상태 조회에 실패했습니다. 다음 점검과 서버 예약 작업 상태를 확인해 주세요.",
    BACKUP_AGENT_MISSING: "백업 PC의 연결 신호가 없습니다. 운영자 PC에서 백업 에이전트 등록과 예약 작업 상태를 확인해 주세요. 기존 백업의 검증 시각과 별도로 확인합니다.",
    BACKUP_AGENT_OFFLINE: "백업 PC의 연결 신호가 2시간 이상 없습니다. PC 전원·Windows 로그인·네트워크·예약 작업을 확인해 주세요. 보고 도구 자체의 중단도 확인해야 합니다.",
    BACKUP_AUTH_REQUIRED: "Codex의 Supabase 연결 인증을 갱신해야 합니다. 운영자 PC에서 Codex의 Supabase MCP를 재인증해 주세요. 인증 복구 후 예약 작업이 누락된 백업과 복원 검사를 자동 실행합니다.",
    BACKUP_RETRY_WAIT: "MCP 연결 점검에 실패했습니다. 운영자 PC가 15~60분 간격으로 재시도합니다. 네트워크와 Codex 설치 상태를 확인해 주세요.",
    BACKUP_RECOVERY_PENDING: "연결은 회복됐지만 새 전체 백업의 복원 검사가 아직 완료되지 않았습니다. 완료 전에는 복구 처리하지 않습니다.",
    BACKUP_STALE: "최근 복원 검증 후 48시간이 지났습니다. 운영자 PC의 전원·Windows 로그인·예약 작업과 네트워크를 확인해 주세요.",
    BACKUP_MISSING: "검증된 전체 백업이 없습니다. 운영자 PC의 백업 도구를 설치하고 첫 백업을 실행해 주세요.",
    BACKUP_STALLED: "백업 실행 신호가 30분 이상 갱신되지 않았습니다. 운영자 PC의 예약 작업 결과와 로컬 상태를 확인해 주세요.",
    BACKUP_FAILED: "백업 또는 복원 검사에 실패했습니다. 운영자 PC의 로컬 상태를 확인해 주세요. 새 백업을 검증하기 전에는 복구 처리하지 않습니다.",
    BACKUP_CHECK_UNAVAILABLE: "백업 상태 조회에 실패했습니다. 서비스 상태와 다음 독립 점검 결과를 확인해 주세요.",
  };
  const safe = Object.hasOwn(reasons, code) ? code : "BACKUP_CHECK_UNAVAILABLE";
  return { code: safe, text: reasons[safe], marker: `<!-- backup-reason:${safe} -->` };
}
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
