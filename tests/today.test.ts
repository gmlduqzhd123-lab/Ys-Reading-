import { describe, it, expect } from "vitest";
import { todayTasks } from "@/lib/today";
import type { DashboardData } from "@/lib/data";
function data(status = "completed", draft = true): DashboardData {
  return {
    profile: { id: "student", role: "student" },
    assignments: [{ id: "a" }, { id: "b" }],
    submissions: [
      {
        id: "old",
        assignment_id: "a",
        student_id: "student",
        version: 1,
        status: "revision_requested",
        title: "초고",
        body: "본문",
        created_at: "2026-01-01",
      },
      {
        id: "new",
        assignment_id: "a",
        student_id: "student",
        version: 2,
        status,
        title: "완성",
        body: "고친 글",
        created_at: "2026-01-02",
      },
    ],
    drafts: draft
      ? [
          {
            id: "d",
            assignment_id: "a",
            student_id: "student",
            title: "새 생각",
            body: "더 다듬은 글",
            updated_at: "2026-01-03",
          },
        ]
      : [],
  } as DashboardData;
}
describe("Today's next action", () => {
  it("continues a newer changed draft after a completed work", () => {
    expect(todayTasks(data())[0].state).toBe("draft");
  });
  it("keeps pending review ahead of unsent edits and uses the latest version", () => {
    const task = todayTasks(data("submitted")).find(
      (t) => t.assignment.id === "a",
    )!;
    expect(task.state).toBe("waiting");
    expect(task.latest?.id).toBe("new");
  });
  it("prioritizes revision requests and never treats an old request as current", () => {
    expect(todayTasks(data("revision_requested"))[0].state).toBe("revision");
    expect(
      todayTasks(data("completed", false)).find((t) => t.assignment.id === "a")!
        .state,
    ).toBe("completed");
  });
});
