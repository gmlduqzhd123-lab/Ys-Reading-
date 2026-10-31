import { z } from "zod";
export const participationCommands = [
  "class_start",
  "assign_choices",
  "choose_mission",
  "preset_save",
  "review_batch",
  "goal_create",
  "goal_claim",
  "exhibition_create",
  "exhibit_submit",
  "exhibit_decide",
  "exhibit_withdraw",
  "job_create",
  "job_toggle",
  "job_apply",
  "job_decide",
  "job_report",
  "job_pay",
  "saving_save",
  "proposal_create",
  "proposal_decide",
  "pack_save",
  "pack_clone",
  "pack_update",
  "pack_visibility",
  "pack_assign",
] as const;
export const participationInput = z
  .object({
    command: z.enum(participationCommands),
    payload: z.record(z.string(), z.unknown()),
    requestId: z.uuid(),
  })
  .strict();
export interface MissionChoice {
  key: string;
  label: string;
  prompt: string;
}
export function missionDisplayTitle(a: {
  choices?: MissionChoice[];
  mission_snapshot: { title: string; theme: string };
}) {
  const theme: Record<string, string> = {
    courage: "용기",
    empathy: "공감",
    fairness: "공정",
  };
  return a.choices?.length
    ? (theme[a.mission_snapshot.theme] ?? "독서") + " · 나의 표현 선택"
    : a.mission_snapshot.title;
}
export const responseChoices: MissionChoice[] = [
  {
    key: "letter",
    label: "인물에게 편지 쓰기",
    prompt:
      "책 속 인물 한 명에게 편지를 써 보세요. 인물의 선택에 대한 내 생각과 책 속 근거를 담아 주세요.",
  },
  {
    key: "ending",
    label: "새로운 결말 만들기",
    prompt:
      "책의 결말을 바꾸어 보세요. 달라진 선택과 그 이유를 책 속 장면과 연결해 설명해 주세요.",
  },
  {
    key: "question",
    label: "궁금한 질문 세우기",
    prompt:
      "함께 생각하고 싶은 질문을 만들고, 그 질문을 떠올린 장면과 나의 잠정적인 답을 적어 주세요.",
  },
];
export const feedbackStarters = [
  "인물의 마음을 구체적으로 짚었어요. 다음에는 그 생각의 근거가 된 장면도 덧붙여 보세요.",
  "자신의 생각과 책 속 장면을 연결했어요. 마지막 문장에서 핵심 생각을 한 번 더 정리해 보세요.",
  "피드백을 반영해 생각이 더 분명해졌어요. 고쳐 쓴 부분과 이유를 스스로 설명해 보세요.",
];
export function participationError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "";
  if (/CHOICE_LOCKED/.test(message))
    return "이미 글쓰기를 시작한 선택은 바꿀 수 없어요. 선택한 활동을 이어가 주세요.";
  if (/CHOICE_REQUIRED/.test(message))
    return "먼저 원하는 표현 방법을 하나 골라 주세요.";
  if (/GOAL_NOT_READY/.test(message))
    return "공동 목표 달성과 나의 참여 기록을 확인한 뒤 배지를 받을 수 있어요.";
  if (/CAPACITY/.test(message))
    return "이 역할의 모집 인원이 찼어요. 다른 역할을 골라 주세요.";
  if (/STALE|LATEST|TRANSITION/.test(message))
    return "이미 처리되었거나 새로운 기록이 있어요. 최신 상태를 확인해 주세요.";
  if (/IDEMPOTENCY/.test(message))
    return "이전 요청과 내용이 달라요. 처리 결과를 확인한 뒤 다시 시작해 주세요.";
  if (/FORBIDDEN|CONSENT|UNAUTHENTICATED/.test(message))
    return "이 학급에서 참여할 수 있는 계정인지 확인해 주세요. 동의·비밀번호 확인이 필요할 수 있어요.";
  if (/INVALID|constraint|syntax/.test(message) || error instanceof z.ZodError)
    return "입력한 제목·내용·인원·기간을 다시 확인해 주세요.";
  return "처리하지 못했어요. 입력을 유지한 채 다시 시도해 주세요.";
}
export interface LessonPack {
  id: string;
  teacher_id: string;
  title: string;
  description: string;
  mission_id: string;
  grade_band: string;
  theme: string;
  choices: MissionChoice[];
  feedback: string;
  criteria: string;
  goal_target: number;
  published: boolean;
  source_id: string | null;
}
export interface ForestGoal {
  id: string;
  classroom_id: string;
  title: string;
  kind: string;
  target: number;
  progress: number;
  mine: number;
  claimed: boolean;
  starts_at: string;
  ends_at: string;
}
export interface Exhibition {
  id: string;
  classroom_id: string;
  group_id: string | null;
  title: string;
  description: string;
  ends_at: string;
}
export interface Exhibit {
  id: string;
  exhibition_id: string;
  post_id: string;
  student_id: string;
  status: string;
  title: string;
  body: string;
  pen_name: string;
}
export interface ClassJob {
  id: string;
  classroom_id: string;
  title: string;
  description: string;
  reward: number;
  capacity: number;
  active: boolean;
}
export interface JobApplication {
  id: string;
  job_id: string;
  student_id: string;
  status: string;
  report: string;
  display_name: string;
}
export interface ShopProposal {
  id: string;
  classroom_id: string;
  student_id: string;
  name: string;
  reason: string;
  price: number;
  status: string;
}
export interface ParticipationData {
  goals: ForestGoal[];
  exhibitions: Exhibition[];
  exhibits: Exhibit[];
  jobs: ClassJob[];
  applications: JobApplication[];
  proposals: ShopProposal[];
  savings: {
    id: string;
    classroom_id: string;
    title: string;
    target: number;
  }[];
  packs: LessonPack[];
  presets: { id: string; title: string; body: string }[];
  selections: { assignment_id: string; choice_key: string }[];
}
