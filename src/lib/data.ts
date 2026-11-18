import "server-only";
import { requireProfile, type Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type { Profile } from "@/lib/auth";
export interface Classroom {
  simple_student_view?: boolean;
  reading_guidance?: "line" | "guided" | "free";
  id: string;
  name: string;
  teacher_id: string;
  created_at: string;
  academic_year?: number | null;
  semester?: number | null;
  grade_level?: number | null;
  term_state?: "open" | "archived";
  term_revision?: number;
}
export interface MissionSnapshot {
  id?: string;
  slug?: string;
  title: string;
  theme: "courage" | "empathy" | "fairness";
  grade_band: "3-4" | "5-6";
  prompt: string;
  description: string;
  minutes: number;
  requires_revision: boolean;
  steps?: string[];
  kind?: string;
}
export interface Assignment {
  choices?: import("./participation").MissionChoice[];
  success_criteria?: string;
  id: string;
  classroom_id: string;
  mission_id: string;
  mission_snapshot: MissionSnapshot;
  due_at: string | null;
  created_at: string;
}
export interface Draft {
  id: string;
  assignment_id: string;
  student_id: string;
  title: string;
  body: string;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  title: string;
  body: string;
  version: number;
  status: "submitted" | "revision_requested" | "completed";
  request_id: string;
  is_late: boolean;
  created_at: string;
}
export interface Feedback {
  id: string;
  submission_id: string;
  teacher_id: string;
  body: string;
  decision: "revision_requested" | "completed";
  created_at: string;
}
export interface Badge {
  id: string;
  student_id: string;
  code: string;
  source_submission_id: string;
  created_at: string;
}
export interface RubricItem {
  key: string;
  label: string;
  max: number;
}
export interface Contest {
  group_id?: string | null;
  id: string;
  classroom_id: string;
  title: string;
  description: string;
  opens_at: string;
  closes_at: string;
  status: "open" | "reviewing" | "published";
  rubric: RubricItem[];
  created_at: string;
}
export interface Entry {
  id: string;
  contest_id: string;
  student_id: string;
  submission_id: string;
  title: string;
  body: string;
  receipt: string;
  request_id: string;
  created_at: string;
}
export interface Review {
  id: string;
  entry_id: string;
  teacher_id: string;
  scores: Record<string, number>;
  comment: string;
  created_at: string;
}
export interface DashboardData {
  pagination?: {
    page: number;
    total: number;
    hasNext: boolean;
    classroom: string | null;
    status: string;
  };
  entryPage?: number;
  entryTotal?: number;
  eligibleTotal?: number;
  progress?: { completed: number; badges: Record<string, number> };
  gradeGroups?: { id: string; name: string }[];
  gradeMembers?: {
    group_id: string;
    classroom_id: string;
    approved: boolean;
  }[];
  profile: Profile;
  classes: Classroom[];
  assignments: Assignment[];
  drafts: Draft[];
  submissions: Submission[];
  feedback: Feedback[];
  badges: Badge[];
  contests: Contest[];
  entries: Entry[];
  reviews: Review[];
}

export async function loadDashboard(
  options: {
    view?: string;
    classroom?: string;
    page?: number;
    assignment?: string;
    status?: string;
    entryPage?: number;
  } = {},
): Promise<DashboardData> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const r = await supabase.rpc("workspace_page", {
    p_view: options.assignment ? "work" : (options.view ?? "missions"),
    p_classroom: options.classroom || null,
    p_page: options.page ?? 1,
    p_assignment: options.assignment || null,
    p_status:
      options.status ??
      (profile.role === "teacher" && options.view === "feedback"
        ? "submitted"
        : "all"),
    p_entry_page: options.entryPage ?? 1,
  });
  if (r.error || !r.data)
    throw Error(
      "학습 목록을 읽지 못했어요. 학급·페이지와 연결 상태를 확인해 주세요.",
    );
  return { ...r.data, profile } as DashboardData;
}
