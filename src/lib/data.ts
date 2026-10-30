import "server-only";
import { requireProfile, type Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type { Profile } from "@/lib/auth";
export interface Classroom {
  id: string;
  name: string;
  teacher_id: string;
  created_at: string;
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

export async function loadDashboard(): Promise<DashboardData> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const tables = [
    "classrooms",
    "assignments",
    "drafts",
    "submissions",
    "feedback",
    "badges",
    "contests",
    "entries",
    "reviews",
  ] as const;
  // Every query uses the user's JWT and RLS. Never replace with a secret-key client.
  const results = await Promise.all(
    tables.map(async (table) => {
      const rows: unknown[] = [];
      const pageSize = 500;
      for (let offset = 0; offset < 10000; offset += pageSize) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + pageSize - 1);
        if (error)
          throw new Error(
            "학습 정보를 불러오지 못했습니다. 연결 상태와 데이터베이스 설정을 확인해 주세요.",
          );
        rows.push(...(data ?? []));
        if (!data || data.length < pageSize) return rows;
      }
      // Avoid silently showing an incomplete review queue if this pilot grows beyond its initial scope.
      throw new Error(
        "학습 기록이 많아 한 번에 불러올 수 없습니다. 운영자에게 학급별 조회 설정을 문의해 주세요.",
      );
    }),
  );
  const [
    classes,
    assignments,
    drafts,
    submissions,
    feedback,
    badges,
    contests,
    entries,
    reviews,
  ] = results;
  const [groups, members] = await Promise.all([
    supabase.from("grade_groups").select("id,name").limit(500),
    supabase
      .from("grade_members")
      .select("group_id,classroom_id,approved")
      .limit(500),
  ]);
  for (const response of [groups, members])
    if (response.error && !["42P01", "PGRST205"].includes(response.error.code))
      throw new Error("학년 연결 정보를 읽지 못했습니다.");
  return {
    profile,
    classes,
    assignments,
    drafts,
    submissions,
    feedback,
    badges,
    contests,
    entries,
    reviews,
    gradeGroups: groups.data ?? [],
    gradeMembers: members.data ?? [],
  } as DashboardData;
}
