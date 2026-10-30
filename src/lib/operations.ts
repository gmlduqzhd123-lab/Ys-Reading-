export interface OperationsState {
  operator: boolean;
  classes: {
    id: string;
    name: string;
    teacher_id: string;
    retention_days: number | null;
  }[];
  students: {
    id: string;
    display_name: string;
    consent_status: string;
    account_active: boolean;
    must_change_password: boolean;
    classroom_id: string;
    active: boolean;
    login_id: string | null;
    last_activity: string | null;
  }[];
  teachers: { id: string; display_name: string; account_active: boolean }[];
  groups?: { id: string; name: string; owner_id: string }[];
  teacher_requests: { user_id: string; display_name: string; status: string }[];
  consents: {
    id: string;
    student_id: string;
    classroom_id: string;
    method: string;
    reference: string;
    confirmed_on: string;
    status: string;
  }[];
  deletions: {
    id: string;
    student_id: string;
    classroom_id: string | null;
    scope: string;
    reason: string;
    status: string;
  }[];
  audit: {
    id: string;
    event: string;
    subject_id: string | null;
    classroom_id: string | null;
    created_at: string;
  }[];
}

// Numeric Seoul time is identical across Node and browser ICU locale data.
export function formatOperationsDate(value: string) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "날짜 확인 필요";
  return new Date(ms + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}
export function operationsError(error: unknown) {
  const m =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : String(error);
  if (/BF_PASSWORD_WEAK/.test(m))
    return "새 비밀번호는 영문 대·소문자와 숫자를 포함해 12~128자로 입력해 주세요.";
  if (/BF_PASSWORD_CURRENT/.test(m))
    return "현재 비밀번호를 다시 확인해 주세요.";
  if (/BF_PASSWORD_DIFFERENT/.test(m))
    return "현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.";
  if (/BF_BUSY/.test(m))
    return "앞선 요청을 처리하고 있어요. 2분 뒤 같은 내용으로 다시 시도해 주세요.";
  if (/BF_IDEMPOTENCY/.test(m))
    return "이전 요청과 내용이 달라요. 처리 결과를 확인한 뒤 새 요청으로 시작해 주세요.";
  if (/BF_LOGIN_TAKEN|duplicate key/.test(m))
    return "이미 사용 중인 아이디 또는 처리 중인 요청이 있어요. 현재 명단을 확인해 주세요.";
  if (/BF_HANDOVER_REQUIRED/.test(m))
    return "담당 학급과 학년 모임을 먼저 인계해 주세요.";
  if (/BF_NOT_EXPIRED/.test(m))
    return "보관 기간이 지나지 않았거나 새 활동이 있어요. 기록을 다시 확인해 주세요.";
  if (/BF_ACCOUNT_BLOCKED/.test(m))
    return "계정 상태가 바뀌었어요. 비밀번호 변경 또는 재로그인이 필요해요.";
  if (/BF_(FORBIDDEN|UNAUTHENTICATED)/.test(m))
    return "이 작업을 할 수 있는 권한이 없어요.";
  return "요청을 완료하지 못했어요. 입력과 현재 처리 상태를 확인해 주세요.";
}
export const operationLabels: Record<string, string> = {
  teacher_request: "교사 권한 신청",
  teacher_decide: "교사 권한 심사",
  consent_request: "동의 확인 요청",
  consent_decide: "동의 확인 심사",
  consent_withdraw: "참여 동의 철회",
  retention_set: "보관 기간 변경",
  deletion_request: "삭제 요청",
  deletion_decide: "삭제 심사",
  deletion_cancel: "삭제 승인 취소",
  class_handover: "학급 인계",
  group_handover: "학년 모임 인계",
  account_status: "계정 상태 변경",
  records_purged: "학습 기록 삭제",
  create_students: "학생 계정 발급",
  reset_password: "초기 비밀번호 재발급",
  change_password: "본인 비밀번호 변경",
  delete_account: "삭제 완료",
  operator_assigned_by_owner: "운영자 지정",
};
export const statusLabels: Record<string, string> = {
  pending: "확인 대기",
  approved: "승인",
  rejected: "반려",
  withdrawn: "철회",
  purged: "기록 삭제 완료 · 계정 삭제 재시도 필요",
  completed: "삭제 완료",
};
