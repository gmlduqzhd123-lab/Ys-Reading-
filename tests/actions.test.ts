import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  configured: true,
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  profile: { id: "11111111-1111-4111-8111-111111111111", role: "student", consent_status: "verified", display_name: "테스트 학생" } as Record<string, string> | null,
  rpc: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => state.configured }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: {
    getUser: state.getUser,
    signOut: state.signOut,
    signInWithPassword: state.signIn,
  },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }) }),
  rpc: state.rpc,
}) }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));

import { createClassroom, createContest, enterContest, login, saveDraft, submitReview, submitWork } from "@/app/actions";

const assignmentId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const writing = { assignmentId, title: "나의 생각", body: "주인공의 선택에는 친구를 생각하는 마음이 담겨 있어요." };

beforeEach(() => {
  vi.clearAllMocks();
  state.configured = true;
  state.user = { id: "11111111-1111-4111-8111-111111111111" };
  state.profile = { id: state.user.id, role: "student", consent_status: "verified", display_name: "테스트 학생" };
  state.getUser.mockImplementation(async () => ({ data: { user: state.user }, error: null }));
  state.rpc.mockResolvedValue({ data: { id: "saved-row", revision: 1 }, error: null });
  state.signOut.mockResolvedValue({ error: null });
  state.signIn.mockResolvedValue({ data: { user: state.user }, error: null });
});

describe("server action boundaries", () => {
  it("does not claim to save when Supabase is unconfigured", async () => {
    state.configured = false;
    expect((await saveDraft({ ...writing, expectedRevision: 0 })).ok).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("requires a verified authenticated user before submission", async () => {
    state.user = null;
    expect((await submitWork({ ...writing, requestId })).ok).toBe(false);
    expect(state.getUser).toHaveBeenCalledOnce();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("prevents a student pending consent from writing even with valid form input", async () => {
    state.profile!.consent_status = "pending";
    const result = await saveDraft({ ...writing, expectedRevision: 0 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("동의");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("does not allow a student to create a classroom", async () => {
    const form = new FormData();
    form.set("name", "나의 학급");
    expect((await createClassroom(form)).ok).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rejects a forged student identity on a submission request", async () => {
    const input = { ...writing, requestId, studentId: "someone-else" };
    expect((await submitWork(input)).ok).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("allows an empty draft but refuses a whitespace-only final submission", async () => {
    expect((await saveDraft({ assignmentId, title: "", body: "", expectedRevision: 0 })).ok).toBe(true);
    state.rpc.mockClear();
    expect((await submitWork({ ...writing, body: " \n ", requestId })).ok).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("passes the revision and idempotency identifiers without trusting an actor supplied by the client", async () => {
    const result = await submitWork({ ...writing, requestId });
    expect(result.data).toEqual({ id: "saved-row", revision: 1 });
    expect(state.rpc).toHaveBeenCalledWith("submit_work", {
      p_assignment_id: assignmentId, p_title: writing.title, p_body: writing.body, p_request_id: requestId,
    });
    expect(state.revalidate).toHaveBeenCalledWith("/app", "layout");
  });

  it("does not expose database errors or submitted writing to the user", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "Database detail includes private-writing-secret" } });
    const result = await submitWork({ ...writing, requestId });
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("private-writing-secret");
    expect(result.message).not.toContain(writing.body);
  });

  it("provides a recoverable message for an optimistic-concurrency conflict", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "BF_DRAFT_CONFLICT" } });
    const result = await saveDraft({ ...writing, expectedRevision: 2 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("다른 창");
  });

  it("distinguishes a reused request ID with different contents from an editor conflict", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "BF_IDEMPOTENCY_CONFLICT" } });
    const result = await submitWork({ ...writing, requestId });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("이전 요청과 내용이 달라요");
    expect(result.message).not.toContain("다른 창");
  });

  it("interprets datetime-local input in Korea time regardless of host timezone", async () => {
    state.profile!.role = "teacher";
    const form = new FormData();
    for (const [key, value] of Object.entries({ classroomId: assignmentId, title: "용기 축제", description: "우리의 생각을 나눠요.", opensAt: "2027-01-01T09:00", closesAt: "2027-01-02T18:00" })) form.set(key, value);
    expect((await createContest(form)).ok).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("create_contest", expect.objectContaining({ p_opens_at: "2027-01-01T00:00:00.000Z", p_closes_at: "2027-01-02T09:00:00.000Z" }));
  });

  it("rejects invalid rubric scores before a database mutation", async () => {
    state.profile!.role = "teacher";
    const result = await submitReview({ entryId: assignmentId, scores: { thought: 31, evidence: 30, structure: 25, expression: 15 }, comment: "잘 읽었습니다." });
    expect(result.ok).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("returns an existing receipt on an idempotent retry as returned by the authoritative database", async () => {
    state.rpc.mockResolvedValue({ data: { id: "entry-1", receipt: "BOOK-123" }, error: null });
    const result = await enterContest({ contestId: assignmentId, submissionId: assignmentId, requestId });
    expect(result.data?.receipt).toBe("BOOK-123");
  });

  it("clears a just-issued session when the account has no application profile", async () => {
    state.profile = null;
    const form = new FormData();
    form.set("identifier", "student-01");
    form.set("password", "test-password-only");
    const result = await login(form);
    expect(result.ok).toBe(false);
    expect(state.signIn).toHaveBeenCalledWith({ email: "student-01@students.bookforest.invalid", password: "test-password-only" });
    expect(state.signOut).toHaveBeenCalledOnce();
    expect(state.redirect).not.toHaveBeenCalled();
  });
});
