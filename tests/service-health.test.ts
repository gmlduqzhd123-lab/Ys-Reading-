import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abort: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));
import { checkService } from "@/lib/service-health";
describe("Service readiness never mistakes configuration for availability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.rpc.mockReset().mockReturnValue({ abortSignal: mocks.abort });
    mocks.abort.mockReset().mockResolvedValue({ data: true, error: null });
  });
  it("reports missing configuration as degraded without a network request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await checkService(null)).status).toBe("degraded");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires both database and authentication to be healthy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(
      (await checkService({ url: "https://example.test", key: "public" }))
        .status,
    ).toBe("ok");
    mocks.abort.mockResolvedValue({
      data: null,
      error: { message: "private error must not escape" },
    });
    const failed = await checkService({
      url: "https://example.test",
      key: "public",
    });
    expect(failed.status).toBe("degraded");
    expect(failed.checks.authentication).toBe(true);
    expect(JSON.stringify(failed)).not.toContain("private error");
  });
  it("retains database readiness while auth is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Error("network")));
    const r = await checkService({
      url: "https://example.test",
      key: "public",
    });
    expect(r.checks).toEqual({ database: true, authentication: false });
    expect(r.status).toBe("degraded");
  });
});
