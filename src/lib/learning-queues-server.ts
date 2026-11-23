import "server-only";
import { requireProfile } from "./auth";
import { createClient } from "./supabase/server";
import { z } from "zod";
import type { TodayState, TodayTask, ReviewState } from "./learning-queues";
import type { Assignment, Classroom, DashboardData, Draft, Submission } from "./data";

const priority: Record<string, number> = { revision: 0, draft: 1, new: 2, waiting: 3, completed: 4 };
type TaskRow = Pick<Assignment, "id" | "classroom_id" | "due_at" | "created_at">;
type TaskDraft = Pick<Draft, "title" | "body" | "updated_at">;
type TaskSubmission = Pick<Submission, "status" | "created_at" | "version">;
type RankedTask = TodayTask & { created_at: string };
function rankTask(a: TaskRow, title: string, draft?: TaskDraft, submission?: TaskSubmission): RankedTask {
  const draftAvailable = draft && (draft.title.trim() || draft.body.trim())
    && (!submission || Date.parse(draft.updated_at) > Date.parse(submission.created_at));
  const state = submission?.status === "revision_requested" ? "revision"
    : submission?.status === "submitted" ? "waiting"
    : draftAvailable ? "draft"
    : submission?.status === "completed" ? "completed"
    : "new";
  return { id: a.id, classroom_id: a.classroom_id, created_at: a.created_at,
    mission_snapshot: { title }, due_at: a.due_at, state, version: submission?.version ?? null };
}
const deadline = (task: TodayTask) => task.due_at ? Date.parse(task.due_at) : Number.MAX_SAFE_INTEGER;
function compareTasks(a: RankedTask, b: RankedTask) {
  return priority[a.state] - priority[b.state] || deadline(a) - deadline(b)
    || Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);
}
async function nextClassTask(client: Awaited<ReturnType<typeof createClient>>, classroom: string, student: string) {
  // The selected mission page is ordered by creation date. Read the whole
  // classroom independently, using an ID cursor and only the fields for ranking.
  const batchSize = 200;
  let cursor: string | undefined;
  let next: RankedTask | null = null;
  for (;;) {
    let query = client.from("assignments")
      .select("id,classroom_id,due_at,created_at,title:mission_snapshot->>title,drafts(title,body,updated_at),submissions(status,created_at,version)")
      .eq("classroom_id", classroom)
      .eq("drafts.student_id", student)
      .eq("submissions.student_id", student)
      .order("id")
      .order("version", { referencedTable: "submissions", ascending: false })
      .limit(1, { referencedTable: "submissions" })
      .limit(batchSize);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw Error("이 학급의 우선 미션을 확인하지 못했어요. 연결을 확인해 주세요.");
    const rows = data as (TaskRow & { title: string; drafts: TaskDraft[]; submissions: TaskSubmission[] })[];
    for (const row of rows) {
      const task = rankTask(row, row.title, row.drafts[0], row.submissions[0]);
      if (priority[task.state] <= priority.new && (!next || compareTasks(task, next) < 0)) next = task;
    }
    if (rows.length < batchSize) return next;
    cursor = rows.at(-1)!.id;
  }
}

export async function loadStudentToday(page = 1, classroom?: Classroom): Promise<TodayState | null> {
  const p = await requireProfile();
  if (p.role !== "student" || p.consent_status !== "verified") return null;
  const currentPage = Math.max(1, Math.min(100000, Math.trunc(page) || 1));
  const c = await createClient();
  if (classroom) {
    const base = { asOf: new Date().toISOString(), page: currentPage, pageSize: 30, pendingClasses: 0 };
    if (classroom.term_state === "archived") return { ...base, total: 0, tasks: [] };
    const [{ data, error }, nextTask] = await Promise.all([
      c.rpc("workspace_page", { p_view: "missions", p_classroom: classroom.id, p_page: currentPage }),
      currentPage === 1 ? nextClassTask(c, classroom.id, p.id) : Promise.resolve(null),
    ]);
    if (error || !data) throw Error("이 학급의 할 일을 읽지 못했어요. 연결을 확인해 주세요.");
    const { assignments, drafts, submissions, pagination } = data as DashboardData;
    const latest = new Map(submissions.map(s => [s.assignment_id, s]));
    const draftByAssignment = new Map(drafts.map(d => [d.assignment_id, d]));
    const tasks = assignments.map(a => rankTask(a, a.mission_snapshot.title,
      draftByAssignment.get(a.id), latest.get(a.id))).sort(compareTasks);
    return { ...base, total: pagination?.total ?? assignments.length, tasks, nextTask };
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
