import { z } from "zod";

export const bookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().max(200).default(""),
  publisher: z.string().max(200).default(""),
  isbn: z.string().max(40).default(""),
  thumbnail: z.string().max(1000).default(""),
});
export type Book = z.infer<typeof bookSchema>;
export const commands = [
  "reading_save",
  "reading_verify",
  "attendance",
  "character_save",
  "invite_create",
  "join_class",
  "enrollment_decide",
  "enrollment_pause",
  "group_create",
  "group_join",
  "group_approve",
  "group_code",
  "festival_create",
  "plaza_share",
  "plaza_moderate",
  "plaza_react",
  "shop_create",
  "shop_toggle",
  "shop_buy",
  "order_decide",
  "wallet_adjust",
  "economy_settings",
  "monthly_awards",
] as const;
export type HubCommand = (typeof commands)[number];
export const commandSchema = z
  .object({
    command: z.enum(commands),
    payload: z.record(z.string(), z.unknown()),
    requestId: z.uuid(),
  })
  .strict();
export const readingSchema = z
  .object({
    id: z.uuid().optional(),
    classroomId: z.uuid(),
    book: bookSchema,
    readOn: z.iso.date(),
    status: z.enum(["reading", "completed"]),
    thought: z.string().trim().min(1).max(10000),
    question: z.string().max(2000).default(""),
    revision: z.number().int().positive().optional(),
  })
  .strict();
export const badgeLabels: Record<string, string> = {
  reader_5: "다섯 번의 독서 기록",
  mission_5: "독서미션 탐험가",
  attendance_5: "꾸준한 독서가",
  revision_1: "고쳐쓰기 달인",
  reading_king: "우리 반 독서왕",
  mission_king: "독서미션왕",
  attendance_king: "책숲 출석왕",
};
export const activityLabels: Record<string, string> = {
  reading: "확인된 독서 기록",
  mission: "미션 완료",
  revision: "피드백 반영·수정 완료",
  festival: "학급·학년 글쓰기 참여",
  attendance: "책숲 활동 출석",
};
export function ledgerReason(reason: string) {
  const prefix = "학습 활동 보상: ";
  if (!reason.startsWith(prefix)) return reason;
  return `${activityLabels[reason.slice(prefix.length)] ?? "학습 활동"} 보상`;
}
export const defaultRewards = {
  reading: { xp: 20, coins: 5 },
  mission: { xp: 30, coins: 10 },
  revision: { xp: 20, coins: 5 },
  festival: { xp: 10, coins: 2 },
  attendance: { xp: 5, coins: 0 },
};
export function characterLevel(xp: number) {
  const safe = Math.max(0, Math.floor(xp));
  return {
    level: Math.floor(Math.sqrt(safe / 50)) + 1,
    xp: safe,
    next: 50 * (Math.floor(Math.sqrt(safe / 50)) + 1) ** 2,
  };
}
export function koreanDay(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function readingScrollBehavior():ScrollBehavior{
  if(typeof window==="undefined")return "auto";
  return document.documentElement.dataset.motion==="reduce"||window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth";
}
export function hubError(error: unknown) {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "";
  if (
    error instanceof z.ZodError ||
    /INVALID_INPUT|check constraint|invalid input syntax/.test(text)
  )
    return "입력 형식과 글자 수, 날짜, 금액을 다시 확인해 주세요.";
  if (/DRAFT_CONFLICT/.test(text))
    return "다른 창에서 기록이 바뀌었어요. 현재 글을 복사한 뒤 최신 기록을 열어 주세요.";
  if (/VERIFIED_IMMUTABLE/.test(text))
    return "선생님이 확인한 독서 기록은 보존됩니다. 새로운 기록을 작성해 주세요.";
  if (/IDEMPOTENCY/.test(text))
    return "이전 요청과 내용이 달라요. 현재 처리 결과를 확인하고 다시 시도해 주세요.";
  if (/CONSENT/.test(text))
    return "참여 동의 확인을 기다리고 있어요. 선생님 또는 운영자에게 문의해 주세요.";
  if (/INSUFFICIENT_BALANCE/.test(text))
    return "학급 화폐가 부족해요. 거래 내역을 확인해 주세요.";
  if (/SHOP_UNAVAILABLE/.test(text))
    return "현재 구매할 수 없는 상품이에요. 재고와 학급을 확인해 주세요.";
  if (/INVITE_NOT_FOUND/.test(text))
    return "초대 코드를 찾지 못했어요. 담당 선생님에게 새 코드를 확인해 주세요.";
  if (/FORBIDDEN|UNAUTHENTICATED/.test(text))
    return "이 작업을 할 수 있는 계정이나 학급인지 확인해 주세요.";
  if (/INVALID_TRANSITION/.test(text))
    return "이미 처리된 요청이에요. 최신 상태를 확인해 주세요.";
  return "처리하지 못했어요. 입력 내용을 보관하고 잠시 후 다시 시도해 주세요.";
}
