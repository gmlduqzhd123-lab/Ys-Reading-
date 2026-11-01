export function googleCallbackNotice(
  code: string | undefined,
  connected: boolean,
) {
  if (code === "connected" && connected)
    return "Google Drive 연결을 완료했어요. 기록을 선택해 문서·시트로 저장할 수 있습니다.";
  if (code === "cancelled")
    return "Google 연결을 취소했어요. 필요할 때 아래에서 다시 연결할 수 있습니다.";
  if (code === "school-policy")
    return "학교 Google 계정의 외부 앱 정책으로 연결이 제한됐어요. 학교 계정 관리자에게 책숲의 Drive 연결 허용 여부를 확인해 주세요. Word·CSV 저장은 계속 사용할 수 있어요.";
  if (code === "expired")
    return "Google 연결 대기 시간이 지났거나 요청을 확인할 수 없어요. 아래에서 연결을 다시 시작해 주세요.";
  if (code === "configuration")
    return "Google 연결 설정을 확인할 수 없어요. 설정을 확인한 뒤 다시 연결해 주세요.";
  if (code === "failed")
    return "Google 인증을 완료하지 못했어요. 아래에서 다시 연결해 주세요. 다른 파일 저장은 계속 이용할 수 있습니다.";
  return null;
}
export function googleExportFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "GOOGLE_CONNECT_REQUIRED")
    return {
      status: 401,
      body: {
        code,
        requiresReconnect: true,
        error:
          "Google 연결이 만료됐거나 권한이 변경됐어요. 아래에서 Google 계정을 다시 연결해 주세요.",
      },
    };
  if (code === "GOOGLE_DRIVE_FORBIDDEN")
    return {
      status: 403,
      body: {
        code,
        requiresReconnect: true,
        error:
          "이 Google 계정에서 파일을 만들 권한을 확인하지 못했어요. Drive 접근 설정을 확인하거나 계정을 다시 연결해 주세요.",
      },
    };
  if (code === "GOOGLE_DRIVE_BUSY")
    return {
      status: 503,
      body: {
        code,
        requiresReconnect: false,
        error:
          "Google Drive가 잠시 응답하지 않아요. 선택 내용을 유지한 채 같은 내보내기를 다시 시도해 주세요.",
      },
    };
  if (code === "GOOGLE_DRIVE_QUOTA")
    return {
      status: 507,
      body: {
        code,
        requiresReconnect: false,
        error:
          "Google Drive 저장 공간이 부족해요. 저장 공간을 정리한 뒤 같은 내보내기를 다시 시도해 주세요.",
      },
    };
  if (code === "GOOGLE_NOT_CONFIGURED")
    return {
      status: 503,
      body: {
        code,
        requiresReconnect: false,
        error:
          "Google 연결 설정이 필요합니다. Word·PDF·CSV 저장은 계속 이용할 수 있어요.",
      },
    };
  return null;
}
