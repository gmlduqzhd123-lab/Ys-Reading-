import { it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ origin: vi.fn(), draft: vi.fn() }));
vi.mock("@/lib/request-origin", () => ({ sameOrigin: m.origin }));
vi.mock("@/app/classroom/workshop-actions", () => ({
  workshopDraftAction: m.draft,
}));
import { POST } from "@/app/api/classroom/draft/route";
beforeEach(() => {
  vi.clearAllMocks();
  m.origin.mockReturnValue(true);
  m.draft.mockResolvedValue({
    ok: true,
    revision: 1,
    payload: { thought: "나의 초안" },
  });
});
const request = (body: unknown) =>
  new NextRequest("https://school.example/api/classroom/draft", {
    method: "POST",
    body: JSON.stringify(body),
  });
it("blocks cross-site draft reads before using an account", async () => {
  m.origin.mockReturnValue(false);
  expect((await POST(request({}))).status).toBe(403);
  expect(m.draft).not.toHaveBeenCalled();
});
it("always reads a scoped draft and never caches it or accepts a write action from this route", async () => {
  const r = await POST(
    request({
      owner: "owner",
      scope: "quick",
      context: { classroom: "class" },
      action: "save",
      payload: { thought: "바꾸기" },
    }),
  );
  expect(m.draft).toHaveBeenCalledWith("owner", {
    action: "get",
    scope: "quick",
    context: { classroom: "class" },
  });
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect((await r.json()).ok).toBe(true);
});
it("keeps a failed read distinct from a saved draft", async () => {
  m.draft.mockRejectedValue(Error("NETWORK"));
  const r = await POST(
    request({ owner: "owner", scope: "quick", context: {} }),
  );
  expect(r.status).toBe(503);
  expect((await r.json()).ok).toBe(false);
});
it("returns forbidden without treating it as a retryable network failure", async () => {
  m.draft.mockResolvedValue({
    ok: false,
    code: "FORBIDDEN",
    message: "현재 계정 권한을 확인해 주세요.",
  });
  const r = await POST(
    request({ owner: "owner", scope: "quick", context: {} }),
  );
  expect(r.status).toBe(403);
  expect((await r.json()).code).toBe("FORBIDDEN");
});
