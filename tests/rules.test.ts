import { describe, expect, it } from "vitest";
import { z } from "zod";
import { missions, themes } from "../src/lib/missions";
import {
  formatKoreanDate,
  safeInternalRedirect,
  validateWriting,
} from "../src/lib/rules";

describe("student writing validation", () => {
  it("trims outer whitespace while preserving paragraphs and the student's text", () => {
    const result = validateWriting("  나의 작은 용기  ", "\n첫 번째 생각.\n\n다른 관점도 생각했어요.  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        title: "나의 작은 용기",
        body: "첫 번째 생각.\n\n다른 관점도 생각했어요.",
      });
    }
  });

  it.each([
    ["", "내용"],
    ["제목", " \n\t　"],
    [" \t　", "내용"],
    [null, "내용"],
    ["제목", { body: "내용" }],
    [1, 2],
  ])("rejects empty or non-text input (%j, %j)", (title, body) => {
    expect(validateWriting(title, body).success).toBe(false);
  });

  it("accepts the exact size limit and rejects content beyond either limit", () => {
    expect(validateWriting("가".repeat(100), "나".repeat(10_000)).success).toBe(true);
    expect(validateWriting("가".repeat(101), "내용").success).toBe(false);
    expect(validateWriting("제목", "나".repeat(10_001)).success).toBe(false);
  });
});

describe("safe return paths after authentication", () => {
  it.each(["/app", "/app/classrooms/123", "/missions/courage-34-question?from=home#steps", "/app?tab=%EA%B8%80"])(
    "keeps a valid in-app path: %s",
    (path) => expect(safeInternalRedirect(path)).toBe(path),
  );

  it.each([
    "https://untrusted.example/path",
    "//untrusted.example/path",
    "/\\untrusted.example",
    "/%2funtrusted.example",
    "/%5cuntrusted.example",
    "/%252funtrusted.example",
    "/%255cuntrusted.example",
    "/a/..//untrusted.example",
    "/a/%2e%2e//untrusted.example",
    "/app\r\nLocation: https://untrusted.example",
    "/app?value=%0d%0aLocation:bad",
    "javascript:alert(1)",
    "/bad%escape",
    " app",
    "",
    null,
    ["/app"],
  ])("rejects external or ambiguous redirect input: %j", (path) => {
    expect(safeInternalRedirect(path)).toBe("/app");
  });

  it("validates the fallback instead of allowing a second redirect injection", () => {
    expect(safeInternalRedirect(undefined, "/missions")).toBe("/missions");
    expect(safeInternalRedirect(undefined, "https://untrusted.example")).toBe("/app");
  });
});

describe("Korean deadline display", () => {
  it("rolls the displayed date over at midnight in Korea", () => {
    const result = formatKoreanDate("2026-10-28T15:30:00Z");
    expect(result).toContain("2026년 10월 29일");
    expect(result).toContain("00:30");
  });

  it("supports compact date options while retaining the Korea timezone", () => {
    expect(formatKoreanDate("2026-10-28T15:30:00Z", {
      day: "numeric",
      timeZone: "UTC",
    })).toBe("29일");
  });

  it.each([null, undefined, "", "not-a-date", new Date(Number.NaN)])(
    "does not display an invalid date as a real deadline (%j)",
    (value) => expect(formatKoreanDate(value)).toBe("날짜 미정"),
  );
});

describe("the reusable mission catalog", () => {
  it("provides one complete question, writing, and revision activity for each theme and grade band", () => {
    expect(missions).toHaveLength(18);
    expect(new Set(missions.map((mission) => mission.id)).size).toBe(18);
    expect(new Set(missions.map((mission) => mission.slug)).size).toBe(18);
    for (const theme of Object.keys(themes)) {
      for (const grade of ["3-4", "5-6"]) {
        const group = missions.filter((mission) => mission.theme === theme && mission.grade_band === grade);
        expect(group.map((mission) => mission.kind).sort()).toEqual(["question", "revision", "writing"]);
      }
    }
    for (const mission of missions) {
      expect(z.uuid().safeParse(mission.id).success).toBe(true);
      expect(mission.steps.length).toBeGreaterThanOrEqual(3);
      expect(mission.steps.every((step) => step.trim().length > 0)).toBe(true);
      expect(mission.requires_revision).toBe(mission.kind === "revision");
      expect(mission.minutes).toBeGreaterThan(0);
    }
  });
});
