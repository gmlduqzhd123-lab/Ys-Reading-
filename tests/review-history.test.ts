import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentProfile: async () => ({
  id: "teacher", role: "teacher", account_active: true, must_change_password: false, session_fresh: true,
}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mock }));
import { GET } from "@/app/api/review-history/route";

const classroom = "b88aab36-83e7-4083-8aee-b27f84704c43";
const anchor = "f4e9fe5b-f042-4af8-9193-2b888e9ab078";
const request = () => new NextRequest("http://127.0.0.1:3096/api/review-history?submission=" + anchor);
describe("assignment submission history", () => {
  beforeEach(() => {
    mock.from.mockReset();
    mock.rpc.mockReset();
    mock.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { assignment_id: "this-assignment", student_id: "this-student", assignments: { classroom_id: classroom } },
      }) }) }),
    });
  });

  it("does not fetch history when the teacher can only read the selected class", async () => {
    mock.rpc.mockResolvedValue({ data: { classes: [
      { id: classroom, read: true, review: false, owner: false },
      { id: "other", read: true, review: true, owner: true },
    ] } });
    const result = await GET(request());
    expect(result.status).toBe(404);
    expect(mock.from).toHaveBeenCalledOnce();
    expect(result.headers.get("cache-control")).toBe("private, no-store");
  });

  it("reads only the selected student's assignment with feedback by version", async () => {
    mock.rpc.mockResolvedValue({ data: { classes: [{ id: classroom, review: true, owner: false }] } });
    const feedback = { id: "feedback", body: "이전 피드백", decision: "revision_requested" };
    const rows = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({
      count: 2, data: [{ version: 2, feedback: null }, { version: 1, feedback }],
    }) };
    mock.from.mockReturnValueOnce({ select: () => rows });
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect(rows.eq.mock.calls).toEqual([["assignment_id", "this-assignment"], ["student_id", "this-student"]]);
    expect(await result.json()).toMatchObject({
      page: 1, hasNext: false, submissions: [{ version: 2, feedback: [] }, { version: 1, feedback: [feedback] }],
    });
  });
});
