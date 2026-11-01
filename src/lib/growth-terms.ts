import { z } from "zod";
import { characterLevel } from "./hub";
import type { Classroom } from "./data";
export const growthTermCommands = [
  "equip",
  "decoration_shop",
  "configure",
  "archive",
  "reopen",
  "promote",
  "activate",
  "activate_batch",
  "handover_request",
  "handover_accept",
  "consent_batch",
  "promote_append",
] as const;
export const growthTermInput = z.object({
  command: z.enum(growthTermCommands),
  requestId: z.uuid(),
  payload: z.record(z.string(), z.unknown()),
});
export type GrowthTermCommand = (typeof growthTermCommands)[number];
export interface AppearanceItem {
  key: string;
  slot: "accessory" | "background";
  name: string;
  description: string;
  min_xp: number;
  source: "growth" | "shop";
  canEquip: boolean;
  owned: boolean;
}
export interface GrowthState {
  xp: number;
  revision: number;
  accessory: string | null;
  background: string;
  catalog: AppearanceItem[];
}
export interface TermClass extends Classroom {
  academic_year: number | null;
  semester: number | null;
  grade_level: number | null;
  term_state: "open" | "archived";
  term_revision: number;
  participating: boolean;
}
export interface TermStudent {
  student_id: string;
  display_name: string;
  active: boolean;
  account_active: boolean;
  consent_status: string;
  must_change_password: boolean;
  membership_id: string | null;
  consent_ready: boolean;
  confirmed: boolean;
  deletion_pending: boolean;
}
export interface TermState {
  rosterPage?: number;
  asOf: string;
  selected: string | null;
  classes: TermClass[];
  rosterTotal: number;
  roster: TermStudent[];
  pending: Record<
    "orders" | "writing" | "revision" | "reading" | "roles" | "contests",
    number
  > | null;
  promotions: {
    id: string;
    source_classroom_id: string;
    target_classroom_id: string;
    academic_year: number;
    semester: number;
    source_name: string;
    target_name: string;
    owned_target: boolean;
    prepared: number;
    activated: number;
  }[];
  events: { kind: string; created_at: string }[];
}
export function evolution(xp: number) {
  const level = characterLevel(Math.max(0, xp)).level;
  const stage = level >= 6 ? 4 : level >= 4 ? 3 : level >= 2 ? 2 : 1;
  return {
    stage,
    label: ["작은 새싹", "생각의 탐험가", "이야기 수집가", "책숲의 작가"][
      stage - 1
    ],
    nextXp: [50, 450, 1250, null][stage - 1],
  };
}
export function nextPeriod(year: number, semester: number) {
  return semester === 1
    ? { year, semester: 2 }
    : { year: year + 1, semester: 1 };
}
export function termLabel(c: Pick<TermClass, "academic_year" | "semester">) {
  return c.academic_year && c.semester
    ? `${c.academic_year}학년도 ${c.semester}학기`
    : "학기 미설정";
}
export function growthTermError(error: unknown) {
  const code =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : String(error);
  const messages: Record<string, string> = {
    BF_CLASS_ARCHIVED:
      "보관된 학기예요. 기록은 조회·내보내기할 수 있습니다. 변경하려면 선생님이 학기를 다시 열어 주세요.",
    BF_TERM_CONFIRMATION:
      "새 학급의 참여 동의 승인과 선생님의 참여 시작 확인이 필요해요.",
    BF_PENDING_ORDERS: "예약 중인 상점 주문을 먼저 지급하거나 취소해 주세요.",
    BF_TERM_PERIOD_REQUIRED: "먼저 학년도와 학기를 저장해 주세요.",
    BF_TERM_CONFLICT:
      "다른 화면에서 학기 상태가 바뀌었어요. 새로고침 후 다시 확인해 주세요.",
    BF_CHARACTER_CONFLICT:
      "다른 화면에서 꾸미기를 바꿨어요. 새로고침 후 다시 선택해 주세요.",
    BF_ITEM_LOCKED:
      "아직 사용할 수 없는 장식이에요. 경험치와 상점 지급 여부를 확인해 주세요.",
    BF_ITEM_OWNED: "이미 보유했거나 예약 중인 장식이에요.",
    BF_ALREADY_PROMOTED:
      "선택한 학생 중 같은 학기로 이미 진급 준비한 학생이 있어요.",
    BF_ARCHIVE_FIRST: "기존 학기를 보관한 뒤 진급을 준비해 주세요.",
    BF_TERM_HAS_PROGRESSION:
      "진급으로 연결된 학급의 학년도·학기는 바꿀 수 없어요.",
    BF_BUSY: "계정 처리가 진행 중이에요. 잠시 후 다시 시도해 주세요.",
    BF_ENROLLMENT_CLOSED:
      "이 학급의 참여 기록이 없어 시작할 수 없어요. 운영자에게 문의해 주세요.",
    BF_EVIDENCE_REQUIRED: "선택한 동의 자료를 확인한 뒤 승인해 주세요.",
    BF_HANDOVER_CHANGED:
      "이미 학급 담당자가 바뀌었어요. 새로고침해 현재 담당자를 확인해 주세요.",
    BF_FORBIDDEN:
      "이 작업을 할 권한이 없어요. 로그인과 학급 참여 상태를 확인해 주세요.",
    BF_CONFIRM_REQUIRED: "안내를 읽고 확인 항목을 선택해 주세요.",
    BF_IDEMPOTENCY_CONFLICT:
      "이 요청의 내용이 달라졌어요. 새로고침 후 다시 시도해 주세요.",
  };
  return (
    Object.entries(messages).find(([key]) => code.includes(key))?.[1] ??
    "저장하지 못했어요. 입력과 연결을 확인한 뒤 다시 시도해 주세요."
  );
}
