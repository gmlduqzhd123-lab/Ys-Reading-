import { it, expect } from "vitest";
import { reportBundle, type GrowthReport } from "@/lib/growth-report";
it("preserves factual counts, teacher text and first/final work without inventing assessment", () => {
  const r: GrowthReport = {
    id: "report",
    title: "나의 기록",
    teacher_note: "=교사 관찰\n성장 응원",
    version: 2,
    published_at: null,
    created_at: "2026-11-02",
    snapshot: {
      asOf: "2026-11-02",
      student: { id: "s", name: "학생" },
      classroom: { id: "c", name: "학급", year: 2026, semester: 2 },
      from: null,
      until: null,
      counts: {
        readingLogs: 3,
        completedBooks: 1,
        completedMissions: 2,
        resubmissions: 1,
        feedback: 2,
        xp: 90,
        attendanceDays: 4,
      },
      badges: [],
      works: [
        {
          id: "w",
          title: "수정 <글>",
          body: "최종\n원문",
          version: 2,
          created_at: "2026-11-02",
          firstTitle: "초고",
          firstBody: "처음 원문",
        },
      ],
    },
  };
  const b = reportBundle(r);
  expect(b.entries[0].body).toContain("완독 표시한 책: 1");
  expect(b.entries[0].body).toContain("학교 출결과 다릅니다");
  expect(b.entries[1].body).toBe(r.teacher_note);
  expect(b.entries.slice(2).map((x) => x.body)).toEqual([
    "처음 원문",
    "최종\n원문",
  ]);
  expect(JSON.stringify(b)).not.toContain("우수 등급");
});
