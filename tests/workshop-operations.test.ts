import { it, expect } from "vitest";
import {
  importWorkshopDraft,
  workshopDraftPayloads,
  workshopHref,
  positivePage,
} from "@/lib/workshop-operations";
import { parseLibraryCsv } from "@/lib/library-csv";
const owner = "10000000-0000-4000-8000-000000000001",
  classroom = "30000000-0000-4000-8000-000000000001",
  activity = "40000000-0000-4000-8000-000000000001";
it("restores only the same account, class and assigned answer version", () => {
  const context = { classroom, activity, version: 1 },
    payload = { answers: { q1: "새로운 생각" }, step: 0 },
    raw = JSON.stringify({
      format: "bookforest-workshop-draft",
      version: 1,
      owner,
      scope: "answer",
      context,
      payload,
    });
  expect(importWorkshopDraft(raw, { owner, scope: "answer", context })).toEqual(
    payload,
  );
  expect(() =>
    importWorkshopDraft(raw, {
      owner,
      scope: "answer",
      context: { ...context, version: 2 },
    }),
  ).toThrow("일치");
  expect(() =>
    importWorkshopDraft(raw, { owner: activity, scope: "answer", context }),
  ).toThrow("일치");
});
it("keeps incomplete template drafts without accepting unknown private fields", () => {
  const p = {
    title: "",
    instructions: "편집 중",
    kind: "worksheet",
    revision: 0,
    questions: [{ id: "q1", kind: "text", label: "" }],
  };
  expect(workshopDraftPayloads.template.parse(p)).toEqual(p);
  expect(() =>
    workshopDraftPayloads.template.parse({ ...p, serviceRole: "secret" }),
  ).toThrow();
});
it("reports the invalid CSV row and keeps independent page parameters", () => {
  expect(() =>
    parseLibraryCsv(
      "ISBN,제목,저자,위치,권수\n9788936434120,새 책,교사,책장,0",
    ),
  ).toThrow("2번째 줄");
  const href = workshopHref(classroom, "family", {
    sharePage: 2,
    reportPage: 3,
    shareQ: "우리 반",
  });
  expect(href).toContain("sharePage=2");
  expect(href).toContain("reportPage=3");
  expect(positivePage(-3)).toBe(1);
});
