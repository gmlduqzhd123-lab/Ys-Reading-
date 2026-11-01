import { describe, it, expect, vi } from "vitest";
import { readRecovery, notifyDraftLogout } from "@/lib/draft-recovery";
import { openArchive, sealArchive, parseArchive } from "@/lib/learning-archive";
import { searchSchema, searchHref } from "@/lib/classroom-insights";
const id = "10000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000002";
const draft = {
  version: 1,
  userId: id,
  assignmentId: other,
  revision: 2,
  savedAt: 10000,
  title: "임시 글",
  body: "다시 이어 써요.",
};
const archive = {
  format: "bookforest-learning-archive",
  version: 1,
  createdAt: "2026-11-01T00:00:00Z",
  classroom: { id, name: "가상 반" },
  records: [
    {
      kind: "writing",
      id: other,
      classroom_id: id,
      student_id: other,
      student_name: "가상 학생",
      title: "생각",
      body: "첫 줄\n고친 글",
      question: "",
      recorded_on: "2026-11-01",
      status: "completed",
      version: 2,
      activity: "공감",
      assignment_id: id,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
      verified: true,
    },
  ],
};
describe("Draft recovery boundaries and encrypted archive restore checks", () => {
  it("clears only temporary drafts and tells other tabs without sharing writing", () => {
    const entries = new Map([
      ["bookforest.recovery.v1:one", "private draft"],
      ["studio-sample", "keep"],
      ["bookforest.recovery.v1:two", "another draft"],
    ]);
    const sent: unknown[] = [];
    vi.stubGlobal("sessionStorage", {
      get length() {
        return entries.size;
      },
      key: (i: number) => [...entries.keys()][i],
      removeItem: (k: string) => entries.delete(k),
    });
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        postMessage(v: unknown) {
          sent.push(v);
        }
        close() {}
      },
    );
    try {
      notifyDraftLogout();
      expect([...entries.keys()]).toEqual(["studio-sample"]);
      expect(sent).toEqual(["logout"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("accepts only the matching student and assignment inside its expiry", () => {
    expect(readRecovery(JSON.stringify(draft), id, other, 10001)).toEqual(
      draft,
    );
    expect(readRecovery(JSON.stringify(draft), other, id, 10001)).toBeNull();
    expect(
      readRecovery(JSON.stringify(draft), id, other, 10000 + 86400001),
    ).toBeNull();
    expect(readRecovery(JSON.stringify(draft), id, other, 9999)).toBeNull();
    expect(readRecovery("{bad", id, other)).toBeNull();
  });
  it("encrypts and reopens actual learning records and line breaks", async () => {
    const sealed = await sealArchive(archive, "Test archive phrase 2026!");
    expect(sealed).not.toContain("고친 글");
    expect(sealed).not.toContain("가상 학생");
    expect(await openArchive(sealed, "Test archive phrase 2026!")).toEqual(
      archive,
    );
  });
  it("rejects wrong keys and ciphertext edits", async () => {
    const sealed = await sealArchive(archive, "Test archive phrase 2026!");
    await expect(
      openArchive(sealed, "A different phrase 2026!"),
    ).rejects.toThrow("암호");
    const e = JSON.parse(sealed);
    e.data = (e.data[0] === "A" ? "B" : "A") + e.data.slice(1);
    await expect(
      openArchive(JSON.stringify(e), "Test archive phrase 2026!"),
    ).rejects.toThrow("파일");
  });
  it("rejects cross-class and duplicate records instead of merging them", () => {
    expect(() =>
      parseArchive({
        ...archive,
        records: [{ ...archive.records[0], classroom_id: other }],
      }),
    ).toThrow();
    expect(() =>
      parseArchive({
        ...archive,
        records: [archive.records[0], archive.records[0]],
      }),
    ).toThrow();
  });
  it("validates calendar dates and retains all filters in next-page links", () => {
    expect(searchSchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    expect(
      searchSchema.safeParse({ from: "2026-11-02", to: "2026-11-01" }).success,
    ).toBe(false);
    const f = searchSchema.parse({
      kind: "writing",
      q: "100%_글",
      classroom: id,
      student: other,
      from: "2026-01-01",
      status: "completed",
    });
    const url = new URL(searchHref(f, { page: 2 }), "https://example.test");
    expect(url.searchParams.get("q")).toBe("100%_글");
    expect(url.searchParams.get("student")).toBe(other);
    expect(url.searchParams.get("page")).toBe("2");
  });
});
