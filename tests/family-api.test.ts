import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ budget: vi.fn(), origin: vi.fn() }));
vi.mock("@/lib/api-budget", () => ({ consumeApiBudget: mocks.budget }));
vi.mock("@/lib/request-origin", () => ({ sameOrigin: mocks.origin }));
import { POST } from "@/app/api/family/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  mocks.budget.mockResolvedValue({ allowed: true });
  mocks.origin.mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const request = (token: string) =>
  new NextRequest("https://school.example/api/family", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
it("rejects invalid capabilities and cross-site requests before querying data", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect((await POST(request("invalid"))).status).toBe(404);
  mocks.origin.mockReturnValue(false);
  expect((await POST(request("ab".repeat(32)))).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});
it("keeps the capability out of URLs, returns no-store and uses no privileged credential", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ title: "공유 보고서", works: [] })),
    );
  vi.stubGlobal("fetch", fetcher);
  const token = "ab".repeat(32),
    r = await POST(request(token));
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(r.headers.get("x-robots-tag")).toContain("noindex");
  const [url, options] = fetcher.mock.calls[0];
  expect(url).not.toContain(token);
  expect(options.headers.apikey).toBe("public-test-key");
  expect(options.body).toBe(JSON.stringify({ p_token: token }));
});
it("fails closed when the shared request budget is unavailable", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  mocks.budget.mockResolvedValue({
    allowed: false,
    unavailable: true,
    retryAfter: 60,
  });
  const r = await POST(request("ab".repeat(32)));
  expect(r.status).toBe(503);
  expect(r.headers.get("retry-after")).toBe("60");
  expect(fetcher).not.toHaveBeenCalled();
});
