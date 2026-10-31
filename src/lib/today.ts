import type { DashboardData } from "./data";
export function todayTasks(data: DashboardData) {
  return data.assignments
    .map((a) => {
      const latest = data.submissions
        .filter(
          (s) => s.assignment_id === a.id && s.student_id === data.profile.id,
        )
        .sort((x, y) => y.version - x.version)[0];
      const draft = data.drafts.find(
        (d) => d.assignment_id === a.id && d.student_id === data.profile.id,
      );
      const changedDraft =
        draft &&
        (draft.title.trim() || draft.body.trim()) &&
        (!latest ||
          (Date.parse(draft.updated_at) > Date.parse(latest.created_at) &&
            (draft.title.trim() !== latest.title.trim() ||
              draft.body.trim() !== latest.body.trim())));
      const state =
        latest?.status === "revision_requested"
          ? "revision"
          : latest?.status === "submitted"
            ? "waiting"
            : changedDraft
              ? "draft"
              : latest?.status === "completed"
                ? "completed"
                : "new";
      return { assignment: a, latest, draft, state };
    })
    .sort(
      (a, b) =>
        ["revision", "draft", "new", "waiting", "completed"].indexOf(a.state) -
        ["revision", "draft", "new", "waiting", "completed"].indexOf(b.state),
    );
}
