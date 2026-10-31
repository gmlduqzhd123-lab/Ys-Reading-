import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  role: "teacher",
  entries: [] as any[],
  posts: [] as any[],
  from: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({
    id: "teacher",
    role: state.role,
    consent_status: "verified",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      state.from(table);
      return {
        select: () => ({
          in: (_key: string, ids: string[]) => ({
            eq: (_status: string, status: string) =>
              Promise.resolve({
                data: (table === "exhibition_entries"
                  ? state.entries
                  : state.posts
                ).filter((r) => ids.includes(r.id) && r.status === status),
                error: null,
              }),
          }),
        }),
      };
    },
  }),
}));
import { loadExportBundle } from "@/lib/export-documents";
const input = {
  kind: "exhibition" as const,
  ids: ["b", "a"],
  title: "가상 작품집",
  format: "docx" as const,
  requestId: "request",
};
beforeEach(() => {
  state.role = "teacher";
  state.from.mockClear();
  state.entries = [
    { id: "a", post_id: "p1", status: "approved" },
    { id: "b", post_id: "p2", status: "approved" },
  ];
  state.posts = [
    {
      id: "p1",
      title: "첫 작품",
      body: "나의 글 1",
      pen_name: "가상 필명1",
      status: "published",
    },
    {
      id: "p2",
      title: "둘째 작품",
      body: "나의 글 2",
      pen_name: "가상 필명2",
      status: "published",
    },
  ];
});
describe("Approved exhibition anthology export", () => {
  it("preserves selected order and uses only the public pen name when requested", async () => {
    const result = await loadExportBundle({ ...input, includeNames: true });
    expect(result.entries.map((e) => e.title)).toEqual([
      "둘째 작품",
      "첫 작품",
    ]);
    expect(result.entries[0].meta).toContain("가상 필명2");
  });
  it("omits author labels by default", async () => {
    expect((await loadExportBundle(input)).entries[0].meta).not.toContain(
      "필명",
    );
  });
  it("refuses the entire export when a work is unapproved or withdrawn", async () => {
    state.entries[1].status = "pending";
    await expect(loadExportBundle(input)).rejects.toThrow("BF_FORBIDDEN");
    state.entries[1].status = "approved";
    state.posts[0].status = "withdrawn";
    await expect(loadExportBundle(input)).rejects.toThrow("BF_FORBIDDEN");
  });
  it("does not let a student export classmates' exhibition works", async () => {
    state.role = "student";
    await expect(loadExportBundle(input)).rejects.toThrow("BF_FORBIDDEN");
    expect(state.from).not.toHaveBeenCalled();
  });
});
