import "server-only";
import { requireProfile } from "./auth";
import { createClient } from "./supabase/server";
import { z } from "zod";
import type { TodayState, ReviewState } from "./learning-queues";
import type { Classroom, DashboardData } from "./data";

const priority: Record<string, number> = { revision: 0, draft: 1, new: 2, waiting: 3, completed: 4 };
export async function loadStudentToday(page = 1, classroom?: Classroom): Promise<TodayState | null> {
  const p = await requireProfile();
  if (p.role !== "student" || p.consent_status !== "verified") return null;
  const currentPage = Math.max(1, Math.min(100000, Math.trunc(page) || 1));
  const c = await createClient();
  if (classroom) {
    const base = { asOf: new Date().toISOString(), page: currentPage, pageSize: 30, pendingClasses: 0 };
    if (classroom.term_state === "archived") return { ...base, total: 0, tasks: [] };
    const { data, error } = await c.rpc("workspace_page", {
      p_view: "missions", p_classroom: classroom.id, p_page: currentPage,
    });
    if (error || !data) throw Error("이 학급의 할 일을 읽지 못했어요. 연결을 확인해 주세요.");
    const { assignments, drafts, submissions, pagination } = data as DashboardData;
    const latest = new Map(submissions.map(s => [s.assignment_id, s]));
    const draftByAssignment = new Map(drafts.map(d => [d.assignment_id, d]));
    const tasks = assignments.map(a => {
      const s = latest.get(a.id);
      const draft = draftByAssignment.get(a.id);
      const draftAvailable = !!draft && !!(draft.title.trim() || draft.body.trim())
        && (!s || Date.parse(draft.updated_at) > Date.parse(s.created_at));
      const state = s?.status === "revision_requested" ? "revision"
        : s?.status === "submitted" ? "waiting"
        : draftAvailable ? "draft"
        : s?.status === "completed" ? "completed"
        : "new";
      return { id: a.id, classroom_id: a.classroom_id, mission_snapshot: { title: a.mission_snapshot.title },
        due_at: a.due_at, state, version: s?.version ?? null };
    }).sort((a, b) => priority[a.state] - priority[b.state]
      || (a.due_at ? Date.parse(a.due_at) : Number.MAX_SAFE_INTEGER)
        - (b.due_at ? Date.parse(b.due_at) : Number.MAX_SAFE_INTEGER));
    return { ...base, total: pagination?.total ?? assignments.length, tasks };
  }
  const
    r = await c.rpc("student_today_state", {
      p_page: currentPage,
    });
  if (r.error || !r.data)
    throw Error(
      "오늘 할 일을 읽지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  return r.data as TodayState;
}
export async function loadReviewQueue(
  classroom?: string,
  kind?: string,
  page = 1,
): Promise<ReviewState> {
  const p = await requireProfile();
  if (p.role !== "teacher") throw Error("선생님 계정에서 확인해 주세요.");
  const c = await createClient(),
    r = await c.rpc("review_queue_state", {
      p_classroom: z.uuid().safeParse(classroom).success ? classroom : null,
      p_kind: kind === "reading" ? "reading" : "writing",
      p_page: Math.max(1, Math.min(100000, Math.trunc(page) || 1)),
    });
  if (r.error || !r.data)
    throw Error(
      "학생 확인함을 읽지 못했어요. 담당 학급과 연결을 확인해 주세요.",
    );
  return r.data as ReviewState;
}
