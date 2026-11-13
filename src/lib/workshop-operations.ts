import { z } from "zod";
export const workshopSections = [
  "today",
  "maker",
  "activities",
  "discoveries",
  "library",
  "evidence",
  "family",
  "settings",
  "all",
] as const;
export type WorkshopSection = (typeof workshopSections)[number];
export const draftScopes = ["quick", "answer", "template", "feedback"] as const;
export type WorkshopDraftScope = (typeof draftScopes)[number];
const text = (max: number) => z.string().max(max);
const book = z
  .object({
    title: text(200),
    author: text(200),
    publisher: text(200),
    isbn: text(20),
    thumbnail: text(2000),
  })
  .strict();
const question = z
  .object({
    id: text(20),
    label: text(500),
    kind: z.enum(["text", "choice"]),
    options: z.array(text(200)).max(4).optional(),
    answer: z.number().int().min(0).max(3).optional(),
    explanation: text(1000).optional(),
  })
  .strict();
export const workshopDraftPayloads = {
  quick: z
    .object({
      book,
      thought: text(1000),
      excerpt: text(1000),
      step: z.number().int().min(1).max(2),
    })
    .strict(),
  answer: z
    .object({
      answers: z.record(
        z.string().max(20),
        z.union([text(2000), z.number().int().min(0).max(3)]),
      ),
      step: z.number().int().min(0).max(9),
    })
    .strict(),
  template: z
    .object({
      id: z.uuid().optional(),
      revision: z.number().int().min(0),
      title: text(100),
      instructions: text(3000),
      kind: z.enum(["worksheet", "quiz"]),
      questions: z.array(question).max(10),
    })
    .strict(),
  feedback: z.object({ feedback: text(2000) }).strict(),
};
export function importWorkshopDraft(
  raw: string,
  target: {
    owner: string;
    scope: WorkshopDraftScope;
    context: Record<string, unknown>;
  },
) {
  if (new TextEncoder().encode(raw).length > 100000)
    throw Error("파일이 너무 커요.");
  const v = z
    .object({
      format: z.literal("bookforest-workshop-draft"),
      version: z.literal(1),
      owner: z.uuid(),
      scope: z.enum(draftScopes),
      context: z.record(z.string(), z.unknown()),
      payload: z.record(z.string(), z.unknown()),
    })
    .strict()
    .parse(JSON.parse(raw));
  const canonical = (o: Record<string, unknown>) =>
    JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  if (
    v.owner !== target.owner ||
    v.scope !== target.scope ||
    canonical(v.context) !== canonical(target.context)
  )
    throw Error(
      "현재 계정·학급·활동 버전과 일치하는 초안 파일을 선택해 주세요.",
    );
  return workshopDraftPayloads[v.scope].parse(v.payload) as Record<
    string,
    unknown
  >;
}
export interface WorkshopList<T = Record<string, unknown>> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
export interface WorkshopRecord {
  id: string;
  kind: "reading" | "writing" | "answer" | "paper";
  title: string;
  body: string;
  version: number;
  created_at: string;
  status: string;
  activity_id: string | null;
}
export interface ReportEvidence {
  key: string;
  kind: "answer" | "paper";
  title: string;
  body: string;
  version: number;
  created_at: string;
}
export const reportSource = z.string().regex(/^(answer|paper):[0-9a-f-]{36}$/);
export function positivePage(v: unknown) {
  return Math.max(1, Math.min(10000, Math.trunc(Number(v)) || 1));
}
export function workshopSection(v: unknown): WorkshopSection {
  return workshopSections.includes(v as WorkshopSection)
    ? (v as WorkshopSection)
    : "today";
}
export function workshopHref(
  classroom: string,
  section: string,
  values: Record<string, string | number> = {},
) {
  const p = new URLSearchParams({ classroom, section });
  for (const [k, v] of Object.entries(values))
    if (v !== "" && v !== 1) p.set(k, String(v));
  return "/classroom?" + p;
}
