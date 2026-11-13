import { z } from "zod";
import { bookSchema, type Book } from "./hub";
export const questionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,19}$/),
    label: z.string().trim().min(1).max(500),
    kind: z.enum(["text", "choice"]),
    options: z
      .array(z.string().trim().min(1).max(200))
      .min(2)
      .max(4)
      .optional(),
    answer: z.number().int().min(0).max(3).optional(),
    explanation: z.string().trim().max(1000).optional(),
  })
  .strict();
export type ActivityQuestion = z.infer<typeof questionSchema>;
export const templateSchema = z
  .object({
    id: z.uuid().optional(),
    revision: z.number().int().min(0),
    title: z.string().trim().min(1).max(100),
    instructions: z.string().max(3000),
    kind: z.enum(["worksheet", "quiz"]),
    questions: z.array(questionSchema).min(1).max(10),
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.questions.map((q) => q.id)).size !== v.questions.length)
      c.addIssue({ code: "custom", message: "질문 번호가 겹쳐요." });
    for (const q of v.questions)
      if (
        v.kind === "worksheet"
          ? q.kind !== "text"
          : q.kind !== "choice" ||
            !q.options ||
            q.answer === undefined ||
            q.answer >= q.options.length ||
            !q.explanation
      )
        c.addIssue({
          code: "custom",
          message: "문항·선택지·정답·해설을 확인해 주세요.",
        });
  });
export const libraryBookSchema = z
  .object({
    isbn: z.string().regex(/^[0-9X-]{10,20}$/),
    title: z.string().trim().min(1).max(200),
    author: z.string().max(200),
    location: z.string().max(80),
    copies: z.number().int().min(1).max(999),
  })
  .strict();
export type LibraryBook = z.infer<typeof libraryBookSchema>;
const uuid = z.uuid(),
  revision = z.number().int().min(0);
export const toolPayloads = {
  paper_confirm: z
    .object({
      activity: z.uuid(),
      student: z.uuid(),
      note: z.string().trim().min(1).max(2000),
      confirmed: z.literal(true),
    })
    .strict(),
  options_save: z
    .object({ mode: z.enum(["thought", "quote", "both"]), revision })
    .strict(),
  daily_read: z
    .object({
      book: bookSchema,
      thought: z.string().trim().max(1000),
      excerpt: z.string().trim().max(1000),
    })
    .strict(),
  template_save: templateSchema,
  template_clone: z.object({ id: uuid }).strict(),
  template_publish: z
    .object({
      id: uuid,
      revision,
      published: z.boolean(),
      confirmed: z.boolean(),
    })
    .strict(),
  activity_assign: z
    .object({
      template: uuid,
      revision,
      dueAt: z.union([z.iso.datetime({ offset: true }), z.literal("")]),
      confirmed: z.boolean(),
    })
    .strict(),
  activity_close: z.object({ id: uuid }).strict(),
  activity_submit: z
    .object({
      id: uuid,
      version: revision,
      answers: z.record(
        z.string(),
        z.union([
          z.string().trim().min(1).max(2000),
          z.number().int().min(0).max(3),
        ]),
      ),
    })
    .strict(),
  activity_review: z
    .object({
      id: uuid,
      status: z.enum(["completed", "revision_requested"]),
      feedback: z.string().trim().min(1).max(2000),
    })
    .strict(),
  rhythm_save: z
    .object({ target: z.number().int().min(1).max(7), revision })
    .strict(),
  collection_claim: z
    .object({
      code: z.enum(["seed", "flower", "fox", "owl", "bridge", "lake"]),
    })
    .strict(),
  library_import: z
    .object({ books: z.array(libraryBookSchema).min(1).max(100) })
    .strict(),
  share_create: z
    .object({
      report: uuid,
      days: z.number().int().min(1).max(30),
      tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmed: z.literal(true),
    })
    .strict(),
  share_revoke: z.object({ id: uuid }).strict(),
};
export type ToolCommand = keyof typeof toolPayloads;
export const toolInput = z
  .object({
    owner: uuid,
    classroom: uuid,
    command: z.enum(
      Object.keys(toolPayloads) as [ToolCommand, ...ToolCommand[]],
    ),
    payload: z.record(z.string(), z.unknown()),
    request: uuid,
  })
  .strict();
export function toolError(error: unknown) {
  const m =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "";
  if (error instanceof z.ZodError || /INVALID|constraint/.test(m))
    return "입력한 제목·질문·기간·도서 정보를 확인해 주세요.";
  if (/BF_DAILY_EXISTS/.test(m))
    return "오늘 이 책의 기록이 있어요. 나의 책장에서 기존 기록을 수정해 주세요.";
  if (/BF_READING_REQUIRED/.test(m))
    return "선생님이 정한 구절·생각 항목을 작성해 주세요.";
  if (/BF_COLLECTION_NOT_READY/.test(m))
    return "선생님이 확인한 활동이 도감의 발견 조건에 도달하면 받을 수 있어요.";
  if (/BF_STALE|IDEMPOTENCY/.test(m))
    return "다른 화면에서 변경했거나 이미 제출했어요. 새로고침해 최신 버전을 확인해 주세요.";
  if (/BF_CLASS_ARCHIVED|BF_ACTIVITY_CLOSED/.test(m))
    return "종료된 학기·활동이거나 마감 시간이 지났어요. 기록은 계속 살펴볼 수 있어요.";
  if (/BF_CONFIRM_REQUIRED/.test(m))
    return "배부·공유할 내용과 공개 범위를 확인해 주세요.";
  if (/FORBIDDEN|CONSENT|ACCOUNT_CHANGED/.test(m))
    return "현재 계정의 학급 권한과 참여 동의를 확인해 주세요.";
  return "연결을 확인하고 같은 입력으로 다시 시도해 주세요. 입력은 유지됩니다.";
}
export interface ActivityTemplate {
  id: string;
  owned: boolean;
  title: string;
  instructions: string;
  kind: "worksheet" | "quiz";
  questions: ActivityQuestion[];
  revision: number;
  published: boolean;
}
export interface ClassActivity {
  id: string;
  created_at: string;
  due_at: string | null;
  active: boolean;
  snapshot: Omit<ActivityTemplate, "id" | "owned" | "published">;
}
export interface ActivityAnswer {
  id: string;
  activity_id: string;
  student_id: string;
  student_name: string;
  version: number;
  answers: Record<string, string | number>;
  status: "submitted" | "revision_requested" | "completed";
  feedback: string;
  created_at: string;
  result: {
    score?: number;
    total?: number;
    items?: {
      id: string;
      correct: boolean;
      answer: number;
      explanation: string;
    }[];
  };
}
export interface ClassroomToolState {
  papers: {
    activity_id: string;
    student_id: string;
    student_name: string;
    title: string;
    note: string;
    created_at: string;
  }[];
  classroom: {
    id: string;
    name: string;
    archived: boolean;
    owner: boolean;
    canReview: boolean;
    simple: boolean;
    guidance: string;
  };
  mode: "thought" | "quote" | "both";
  optionsRevision: number;
  books: Book[];
  templates: ActivityTemplate[];
  activities: ClassActivity[];
  activityTotal: number;
  answers: ActivityAnswer[];
  today: { id: string; name: string; readings: number; activities: number }[];
  counts: Record<string, number>;
  collection: string[];
  rhythm: { target: number; revision: number };
  days: string[];
  library: (LibraryBook & { updated_at: string })[];
  libraryTotal: number;
  reports: {
    id: string;
    title: string;
    student_id: string;
    student_name: string;
    created_at: string;
  }[];
  shares: {
    id: string;
    title: string;
    expires_at: string;
    revoked_at: string | null;
  }[];
}
export interface Evidence {
  papers: {
    activity_id: string;
    title: string;
    note: string;
    created_at: string;
  }[];
  student: string;
  readings: {
    id: string;
    title: string;
    thought: string;
    read_on: string;
    verified_at: string | null;
    revision: number;
  }[];
  writing: {
    id: string;
    assignment_id: string;
    title: string;
    body: string;
    version: number;
    status: string;
    created_at: string;
  }[];
  activities: {
    id: string;
    activity_id: string;
    title: string;
    version: number;
    answers: Record<string, string | number>;
    feedback: string;
    status: string;
    created_at: string;
  }[];
}
export const forestDiscoveries = [
  { code: "seed", name: "새싹 오솔길", kind: "reading", count: 1 },
  { code: "flower", name: "책꽃 정원", kind: "reading", count: 3 },
  { code: "fox", name: "여우의 생각 쉼터", kind: "mission", count: 1 },
  { code: "owl", name: "부엉이의 이야기 탑", kind: "mission", count: 3 },
  { code: "bridge", name: "고쳐쓰기 다리", kind: "revision", count: 1 },
  { code: "lake", name: "꾸준함의 호수", kind: "attendance", count: 3 },
] as const;
export const worksheetStarters = [
  {
    title: "인물 인터뷰",
    labels: [
      "만나고 싶은 인물은 누구인가요?",
      "그 인물에게 묻고 싶은 질문과 예상 답은 무엇인가요?",
      "그렇게 생각한 책 속 장면은 무엇인가요?",
    ],
  },
  {
    title: "인물에게 편지",
    labels: [
      "어떤 인물에게 편지를 보내고 싶나요?",
      "전하고 싶은 말과 그 이유를 써 보세요.",
    ],
  },
  {
    title: "다른 결말",
    labels: [
      "바꾸고 싶은 장면은 무엇인가요?",
      "나의 새로운 결말을 써 보세요.",
      "이 결말을 선택한 이유는 무엇인가요?",
    ],
  },
  {
    title: "주장과 근거",
    labels: [
      "책을 읽고 세운 나의 주장은 무엇인가요?",
      "그 주장을 뒷받침하는 장면이나 사실은 무엇인가요?",
    ],
  },
  {
    title: "책과 나의 연결",
    labels: [
      "나의 경험과 닮은 장면은 무엇인가요?",
      "두 경험을 비교하며 새롭게 생각한 것은 무엇인가요?",
    ],
  },
  {
    title: "궁금한 질문",
    labels: [
      "친구들과 나누고 싶은 질문은 무엇인가요?",
      "나의 잠정적인 답과 그 근거를 써 보세요.",
    ],
  },
];
export function rhythmWeek(days: string[], today: string) {
  const d = new Date(today + "T00:00:00Z"),
    weekday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - weekday);
  const start = d.toISOString().slice(0, 10);
  return new Set(days.filter((v) => v >= start && v <= today)).size;
}
export async function shareHash(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
