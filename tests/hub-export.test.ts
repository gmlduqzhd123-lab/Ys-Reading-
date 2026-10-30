import { beforeEach, describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
const state = vi.hoisted(() => ({
  rows: [] as any[],
  error: null as unknown,
  profile: { id: "owner", role: "student", consent_status: "verified" },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => state.profile }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        in: async () => ({ data: state.rows, error: state.error }),
      }),
    }),
  }),
}));
import {
  csvCell,
  printHtml,
  docxBytes,
  loadExportBundle,
} from "@/lib/export-documents";
import { seal, unseal } from "@/lib/token-box";
import { characterLevel, koreanDay } from "@/lib/hub";
const bundle = {
  title: "나의 <책숲>",
  entries: [
    {
      title: "<script>alert(1)</script>",
      meta: "읽은 책",
      body: "생각\n<img src=x onerror=alert(1)>",
      question: "왜 그랬을까?",
    },
  ],
};
describe("Learning exports and confidential OAuth state", () => {
  beforeEach(() => {
    state.rows = [];
    state.error = null;
    state.profile = {
      id: "owner",
      role: "student",
      consent_status: "verified",
    };
  });
  it("escapes executable markup while preserving student paragraphs", () => {
    const html = printHtml(bundle);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;img");
    expect(html).toContain("생각\n");
  });
  it.each([
    '=HYPERLINK("https://bad")',
    "+SUM(1,2)",
    "-1+2",
    "@SUM(1,2)",
    "  =1+1",
  ])("neutralizes spreadsheet formula %s", (text) => {
    expect(csvCell(text).startsWith("\"'")).toBe(true);
  });
  it("exports a real Office Open XML document", async () => {
    const bytes = await docxBytes(bundle);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.length).toBeGreaterThan(1000);
  });
  it("fails the whole export when even one selected record is not authorized", async () => {
    state.rows = [{ id: "a" }];
    await expect(
      loadExportBundle({
        kind: "writing",
        ids: ["a", "b"],
        format: "docx",
        title: "기록",
        requestId: "key",
      }),
    ).rejects.toThrow("BF_FORBIDDEN");
  });
  it("preserves the selected order rather than database return order", async () => {
    state.rows = [
      {
        id: "a",
        title: "앞글",
        body: "가",
        version: 1,
        created_at: "2026-01-01",
      },
      {
        id: "b",
        title: "뒷글",
        body: "나",
        version: 2,
        created_at: "2026-01-02",
      },
    ];
    const output = await loadExportBundle({
      kind: "writing",
      ids: ["b", "a"],
      format: "docx",
      title: "기록",
      requestId: "key",
    });
    expect(output.entries.map((e) => e.title)).toEqual(["뒷글", "앞글"]);
  });
  it("blocks exports for students pending participation consent", async () => {
    state.profile.consent_status = "pending";
    await expect(
      loadExportBundle({
        kind: "writing",
        ids: ["a"],
        format: "docx",
        title: "기록",
        requestId: "key",
      }),
    ).rejects.toThrow("BF_CONSENT_REQUIRED");
  });
  it("rejects tampered cookies, cross-account replay and state/token substitution", () => {
    const key = randomBytes(32);
    const value = seal(
      { access_token: "private-test-token" },
      key,
      "token:teacher-a",
    );
    expect(value).not.toContain("private-test-token");
    expect(unseal(value, key, "token:teacher-a")).toEqual({
      access_token: "private-test-token",
    });
    expect(() => unseal(value, key, "token:teacher-b")).toThrow();
    expect(() => unseal(value, key, "google-state")).toThrow();
    const bytes = Buffer.from(value, "base64url");
    bytes[bytes.length - 1] ^= 1;
    expect(() =>
      unseal(bytes.toString("base64url"), key, "token:teacher-a"),
    ).toThrow();
  });
  it("separates cumulative growth from spending and uses Korean dates", () => {
    expect(characterLevel(200)).toEqual({ level: 3, xp: 200, next: 450 });
    expect(koreanDay(new Date("2026-10-30T15:01:00Z"))).toBe("2026-10-31");
  });
});
