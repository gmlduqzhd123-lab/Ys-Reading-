import { describe, it, expect, vi } from "vitest";
import { formatOperationsDate } from "../src/lib/operations";
import {
  parseAccountInput,
  safePlan,
  runAccountJob,
  type AccountProvider,
  type Job,
  type AccountInput,
} from "../supabase/functions/_shared/account-worker";
const id = "10000000-0000-4000-8000-000000000001";
const input: AccountInput = {
  kind: "create_students",
  requestId: id,
  classroomId: id,
  students: [
    { loginId: "forest01", name: "새싹", password: "StrongInitial7!" },
    { loginId: "forest02", name: "잎새", password: "StrongInitial8!" },
  ],
};
const makeJob = (): Job => ({
  id,
  lease: id,
  kind: "create_students",
  done: false,
  plan: {
    items: [
      { id, loginId: "forest01" },
      { id: "10000000-0000-4000-8000-000000000002", loginId: "forest02" },
    ],
  },
  results: {},
});
function provider(): AccountProvider {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    password: vi.fn().mockResolvedValue(undefined),
    purge: vi.fn().mockResolvedValue({ scope: "account", studentId: id }),
    remove: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn(async (j, i, ok) => ({
      ...j,
      results: ok ? { ...j.results, [i]: "done" } : j.results,
      done: ok && Object.keys(j.results).length + 1 === j.plan.items.length,
    })),
  };
}
describe("Auth operations: no secrets in plans, safe retries and provider failures", () => {
  it("renders the same numeric Seoul timestamp across server/browser locales", () => {
    expect(formatOperationsDate("2026-10-30T15:03:04Z")).toBe(
      "2026-10-31 00:03:04",
    );
    expect(formatOperationsDate("invalid")).toBe("날짜 확인 필요");
  });
  it("keeps credentials out of database plans and strips unrelated claims", () => {
    const parsed = parseAccountInput({ ...input, operator: true, actorId: id });
    expect(parsed).not.toHaveProperty("operator");
    expect(JSON.stringify(safePlan(parsed))).not.toContain("StrongInitial");
    expect(safePlan(parsed)).toEqual({
      classroomId: id,
      students: [
        { loginId: "forest01", name: "새싹" },
        { loginId: "forest02", name: "잎새" },
      ],
    });
  });
  it.each([
    "short",
    "lowercasepassword7",
    "UPPERCASEPASSWORD7",
    "NoNumbersHere!",
  ])("rejects weak passwords (%s)", (p) => {
    expect(() =>
      parseAccountInput({
        ...input,
        students: [{ ...input.students![0], password: p }],
      }),
    ).toThrow("BF_INVALID_INPUT");
  });
  it("rejects duplicate IDs and oversized batches", () => {
    expect(() =>
      parseAccountInput({
        ...input,
        students: [input.students![0], input.students![0]],
      }),
    ).toThrow();
    expect(() =>
      parseAccountInput({
        ...input,
        students: Array(31).fill(input.students![0]),
      }),
    ).toThrow();
  });
  it("does not repeat Auth side effects for a completed request", async () => {
    const p = provider();
    const job = { ...makeJob(), done: true, results: { 0: "done", 1: "done" } };
    expect(await runAccountJob(input, job, p)).toMatchObject({
      ok: true,
      completed: 2,
    });
    expect(p.create).not.toHaveBeenCalled();
  });
  it("resumes only incomplete items after partial failure", async () => {
    const p = provider();
    vi.mocked(p.create)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new Error("provider error includes PRIVATE_SECRET"),
      );
    const first = await runAccountJob(input, makeJob(), p);
    expect(first).toEqual({ ok: false, completed: 1, total: 2 });
    expect(JSON.stringify(first)).not.toContain("PRIVATE_SECRET");
    vi.mocked(p.create).mockClear();
    vi.mocked(p.create).mockResolvedValue(undefined);
    const second = await runAccountJob(
      input,
      { ...makeJob(), results: { 0: "done" } },
      p,
    );
    expect(second.ok).toBe(true);
    expect(p.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(p.create).mock.calls[0][1]).toBe(
      "forest02@students.bookforest.invalid",
    );
  });
  it("does not attach a changed login ID to a prepared user", async () => {
    const p = provider();
    await runAccountJob(
      { ...input, students: [{ ...input.students![0], loginId: "changed" }] },
      makeJob(),
      p,
    );
    expect(p.create).not.toHaveBeenCalled();
  });
  it("never deletes an Auth account before its approved purge succeeds", async () => {
    const p = provider();
    vi.mocked(p.purge).mockRejectedValue(new Error("foreign key"));
    const job = {
      ...makeJob(),
      kind: "delete_account" as const,
      plan: { items: [{ id }], deletionId: id },
    };
    expect(
      (
        await runAccountJob(
          { kind: "delete_account", requestId: id, id },
          job,
          p,
        )
      ).ok,
    ).toBe(false);
    expect(p.remove).not.toHaveBeenCalled();
  });
  it("class-record deletion preserves the Auth account", async () => {
    const p = provider();
    vi.mocked(p.purge).mockResolvedValue({
      scope: "class_records",
      studentId: id,
    });
    const job = {
      ...makeJob(),
      kind: "delete_account" as const,
      plan: { items: [{ id }], deletionId: id },
    };
    expect(
      (
        await runAccountJob(
          { kind: "delete_account", requestId: id, id },
          job,
          p,
        )
      ).ok,
    ).toBe(true);
    expect(p.remove).not.toHaveBeenCalled();
  });
  it("rejects weak or unchanged self-change passwords", () => {
    expect(() =>
      parseAccountInput({
        kind: "change_password",
        requestId: id,
        password: "weak",
        currentPassword: "old",
      }),
    ).toThrow("BF_PASSWORD_WEAK");
    expect(() =>
      parseAccountInput({
        kind: "change_password",
        requestId: id,
        password: "StrongInitial7!",
        currentPassword: "StrongInitial7!",
      }),
    ).toThrow("BF_PASSWORD_DIFFERENT");
  });
});
