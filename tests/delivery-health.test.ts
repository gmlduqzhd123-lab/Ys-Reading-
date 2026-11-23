import { it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase/config", () => ({
  getSupabaseConfig: () => ({
    url: "https://project.invalid",
    key: "public-test-key",
  }),
}));
import { deliveryHealth } from "../src/lib/delivery-health";
afterEach(() => {
  vi.unstubAllGlobals();
});
function githubResponse(url: string) {
  if (url.includes("/jobs?"))
    return Response.json({
      jobs: [
        {
          name: "public-service",
          completed_at: new Date().toISOString(),
          steps: [
            "Notify one incident and its recovery",
            "Notify backup incident and recovery",
          ].map((name) => ({ name, conclusion: "success" })),
        },
      ],
    });
  return Response.json({
    workflow_runs: [
      {
        id: 8,
        name: "Bookforest availability",
        head_branch: "main",
        event: "schedule",
        status: "completed",
      },
    ],
  });
}
it("uses fresh signed PC observations including real notification failures", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        configured: true,
        healthy: false,
        code: "GITHUB_NOTIFY_FAILED",
        observedAt: new Date().toISOString(),
        notifiedAt: null,
        runId: 4,
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(await deliveryHealth()).toMatchObject({
    source: "operator-pc",
    healthy: false,
    code: "GITHUB_NOTIFY_FAILED",
  });
  expect(fetcher).toHaveBeenCalledOnce();
});
it("independently reads fixed public GitHub metadata when the PC is off", async () => {
  const fetcher = vi.fn(async (url: string) =>
    url.includes("/rpc/")
      ? Response.json({
          configured: true,
          observedAt: new Date(Date.now() - 46 * 60000).toISOString(),
        })
      : githubResponse(url),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await deliveryHealth()).toMatchObject({
    source: "server-github",
    healthy: true,
    code: "OK",
    runId: 8,
  });
  for (const call of fetcher.mock.calls.slice(1))
    expect(call[0]).toMatch(
      /^https:\/\/api.github.com\/repos\/gmlduqzhd123-lab\/Ys-Reading-\//,
    );
});
it("does not report success when both observers are unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(Error("provider diagnostic")),
  );
  expect(await deliveryHealth()).toMatchObject({
    healthy: false,
    code: "GITHUB_STATUS_UNAVAILABLE",
  });
});

for (const { github, expected } of [
  { github: "completed", expected: { code: "OK", runId: 8 } },
  { github: "older", expected: { code: "GITHUB_CHECK_RUNNING", runId: 8, notifiedAt: null } },
  { github: "limited", expected: { code: "GITHUB_CHECK_RUNNING", runId: 8, refreshCode: "GITHUB_RATE_LIMITED" } },
]) {
  it(`refreshes a running PC observation with GitHub ${github}`, async () => {
    const lastSuccessAt = new Date(Date.now() - 3600000).toISOString();
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/rpc/")) return Response.json({
        configured: true, healthy: false, code: "GITHUB_CHECK_RUNNING",
        observedAt: new Date().toISOString(), runId: 8, notifiedAt: null, lastSuccessAt,
      });
      if (github === "older" && !url.includes("/jobs?")) {
        const { workflow_runs } = await githubResponse(url).json();
        return Response.json({ workflow_runs: [{ ...workflow_runs[0], id: 7 }] });
      }
      if (github === "limited") return new Response(null, {
        status: 403, headers: { "x-ratelimit-remaining": "0" },
      });
      return githubResponse(url);
    });
    vi.stubGlobal("fetch", fetcher);
    const observed = await deliveryHealth();
    expect(observed).toMatchObject({ source: "server-github", ...expected });
    expect(Date.parse(observed.lastSuccessAt!)).toBeGreaterThanOrEqual(Date.parse(lastSuccessAt));
  });
}
