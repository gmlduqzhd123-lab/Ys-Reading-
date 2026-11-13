import { it, expect } from "vitest";
import { parseLibraryCsv } from "@/lib/library-csv";
import { templateSchema, rhythmWeek } from "@/lib/classroom-tools";
import { activityPrint } from "@/lib/activity-print";
import { verifiedQuiz } from "@/lib/quiz-generation";
it("parses quoted CSV, normalizes ISBN and rejects duplicate editions or malformed input", () => {
  const rows = parseLibraryCsv(
    'ISBN,제목,저자,위치,권수\n9788936434120,"우리, 교실",작가,책장,2',
  );
  expect(rows[0].title).toBe("우리, 교실");
  expect(() =>
    parseLibraryCsv("ISBN,제목,저자,위치,권수\n9788936434121,책,작가,책장,1"),
  ).toThrow();
  expect(() =>
    parseLibraryCsv(
      "ISBN,제목,저자,위치,권수\n9788936434120,책,작가,책장,1\n978-89-364-3412-0,책,작가,책장,1",
    ),
  ).toThrow();
  expect(() =>
    parseLibraryCsv('ISBN,제목,저자,위치,권수\n9788936434120,"책,작가,책장,1'),
  ).toThrow();
});
it("requires valid quiz answers and unique question identifiers before saving", () => {
  const q = {
      id: "q1",
      kind: "choice",
      label: "질문",
      options: ["가", "나"],
      answer: 2,
      explanation: "근거",
    },
    v = {
      revision: 0,
      title: "퀴즈",
      instructions: "",
      kind: "quiz",
      questions: [q],
    };
  expect(templateSchema.safeParse(v).success).toBe(false);
  expect(
    templateSchema.safeParse({
      ...v,
      questions: [
        { ...q, answer: 0 },
        { ...q, answer: 0 },
      ],
    }).success,
  ).toBe(false);
});
it("prints a safe worksheet snapshot without disclosing quiz answers", () => {
  const html = activityPrint(
    {
      id: "a",
      active: true,
      due_at: null,
      created_at: "",
      snapshot: {
        title: "<img src=x onerror=alert(1)>",
        instructions: "<script>bad</script>",
        revision: 2,
        kind: "quiz",
        questions: [
          {
            id: "q1",
            kind: "choice",
            label: "질문",
            options: ["가", "나"],
            answer: 0,
            explanation: "정답 비밀",
          },
        ],
      },
    },
    { q1: "<script>answer</script>" },
  );
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;answer");
  expect(html).not.toContain("정답 비밀");
  expect(html).toContain("배부 버전 2");
});
it("counts distinct participation days from Monday without resetting earlier discoveries", () => {
  expect(
    rhythmWeek(
      ["2026-11-08", "2026-11-09", "2026-11-09", "2026-11-13", "2026-11-14"],
      "2026-11-13",
    ),
  ).toBe(2);
});
it("rejects AI evidence not present in the supplied explanation and out-of-range answers", () => {
  const question = {
    label: "씨앗이 자란 모습은?",
    options: ["나무", "돌"],
    answer: 0,
    explanation: "나무가 되었어요.",
    evidence: "씨앗은 나무가 되었습니다.",
  };
  expect(
    verifiedQuiz("씨앗은 나무가 되었습니다.", { questions: [question] })[0]
      .kind,
  ).toBe("choice");
  expect(() =>
    verifiedQuiz("다른 설명입니다.", { questions: [question] }),
  ).toThrow("QUIZ_SOURCE_MISMATCH");
  expect(() =>
    verifiedQuiz("씨앗은 나무가 되었습니다.", {
      questions: [{ ...question, answer: 3 }],
    }),
  ).toThrow();
});
