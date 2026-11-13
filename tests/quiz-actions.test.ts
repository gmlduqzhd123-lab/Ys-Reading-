import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  rpc: vi.fn(),
  generate: vi.fn(),
  ready: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireProfile: mocks.profile }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/quiz-config", () => ({ quizAiReady: mocks.ready }));
vi.mock("ai", () => ({
  generateText: mocks.generate,
  Output: { object: (v: unknown) => v },
}));
import { quizDraft } from "@/app/classroom/quiz-actions";
const owner = "10000000-0000-4000-8000-000000000001",
  classroom = "30000000-0000-4000-8000-000000000001",
  source =
    "씨앗은 매일 물을 마시고 햇빛을 받았습니다. 씨앗은 나무가 되었습니다. 친구들이 나무 곁에 모였습니다.";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BOOKFOREST_AI_MODEL", "test/model");
  mocks.ready.mockReturnValue(true);
  mocks.profile.mockResolvedValue({ id: owner, role: "teacher" });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "test/model" }] })),
      ),
  );
  mocks.generate.mockResolvedValue({
    output: {
      questions: [
        {
          label: "씨앗은 무엇이 되었나요?",
          options: ["나무", "돌"],
          answer: 0,
          explanation: "나무로 자랐어요.",
          evidence: "씨앗은 나무가 되었습니다.",
        },
      ],
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("requires teacher identity and explicit source transmission consent before any generation", async () => {
  expect(
    (await quizDraft({ owner, classroom, source, confirmed: false })).ok,
  ).toBe(false);
  mocks.profile.mockResolvedValue({ id: owner, role: "student" });
  expect(
    (await quizDraft({ owner, classroom, source, confirmed: true })).ok,
  ).toBe(false);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("checks the live database quota and keeps failures separate from successful generation", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  expect(
    (await quizDraft({ owner, classroom, source, confirmed: true })).ok,
  ).toBe(false);
  expect(mocks.generate).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  const r = await quizDraft({ owner, classroom, source, confirmed: true });
  expect(r.ok).toBe(true);
  expect(mocks.generate.mock.calls[0][0].maxRetries).toBe(0);
  expect(mocks.generate.mock.calls[0][0].maxOutputTokens).toBe(2000);
});
