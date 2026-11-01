import { z } from "zod";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export const searchSchema = z
  .object({
    kind: z.enum(["", "reading", "writing", "draft"]).default(""),
    classroom: z.union([z.uuid(), z.literal("")]).default(""),
    student: z.union([z.uuid(), z.literal("")]).default(""),
    q: z.string().trim().max(100).default(""),
    from: z.union([day, z.literal("")]).default(""),
    to: z.union([day, z.literal("")]).default(""),
    status: z
      .enum([
        "",
        "reading",
        "completed",
        "submitted",
        "revision_requested",
        "draft",
      ])
      .default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "시작 날짜는 끝 날짜보다 늦을 수 없어요.",
  });
export type SearchFilters = z.infer<typeof searchSchema>;
export type LearningRecord = {
  kind: "reading" | "writing" | "draft";
  id: string;
  classroom_id: string;
  student_id: string;
  student_name: string;
  title: string;
  body: string;
  question: string;
  recorded_on: string;
  created_at: string;
  updated_at: string;
  status: string;
  version: number;
  assignment_id: string | null;
  activity: string;
  verified: boolean;
};
export type SearchResult = {
  total: number;
  page: number;
  pageSize: number;
  rows: LearningRecord[];
};
export type ClassInsight = {
  id: string;
  name: string;
  students: number;
  ready: number;
  missing: number;
  overdue: number;
  submitted: number;
  revision: number;
  completed: number;
  reading: number;
  unread: number;
  attention: number;
};
export type ClassOverview = {
  asOf: string;
  page: number;
  pageSize: number;
  studentTotal: number;
  classes: ClassInsight[];
  unread: number;
  alertTotal: number;
  students: {
    classroom_id: string;
    student_id: string;
    display_name: string;
    consent_status: string;
    account_active: boolean;
    must_change_password: boolean;
    missing: number;
    overdue: number;
    revision: number;
    last_activity: string | null;
  }[];
  alerts: {
    kind: string;
    id: string;
    classroom_id: string;
    student_id: string;
    student_name: string;
    at: string;
    assignment_id: string | null;
    unread: boolean;
  }[];
};
export const recordLabels: Record<string, string> = {
  reading: "독서 기록",
  writing: "제출한 글",
  draft: "작성 중인 초안",
};
export const recordStatus: Record<string, string> = {
  reading: "읽는 중",
  completed: "완료",
  submitted: "교사 확인 대기",
  revision_requested: "고쳐쓰기",
  draft: "작성 중",
};
export function searchHref(
  filters: Partial<SearchFilters>,
  changes: Partial<SearchFilters> = {},
) {
  const params = new URLSearchParams({ tab: "search" });
  for (const [k, v] of Object.entries({ ...filters, ...changes }))
    if (v !== "" && v !== undefined && v !== null) params.set(k, String(v));
  return "/hub?" + params;
}
