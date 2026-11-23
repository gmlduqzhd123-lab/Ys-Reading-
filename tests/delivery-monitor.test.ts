import { it, expect, vi } from "vitest";
import { probeGithubDelivery } from "../scripts/lib/delivery-monitor.mjs";
import { notificationClient } from "../scripts/lib/github-notification-client.mjs";
const now = Date.parse("2026-11-18T10:00:00Z");
it("recognizes the current completed notification steps without repeatedly blaming an older scheduled run", async () => {
  const runs = [
    {
      id: 2,
      name: "Bookforest availability",
      head_branch: "main",
      event: "schedule",
      status: "in_progress",
    },
    {
      id: 1,
      name: "Bookforest availability",
      head_branch: "main",
      event: "schedule",
      status: "completed",
    },
  ];
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ workflow_runs: runs }))
    .mockResolvedValueOnce(
      Response.json({
        jobs: [
          {
            name: "public-service",
            steps: [
              ...[
                "Notify one incident and its recovery",
                "Notify backup incident and recovery",
              ].map((name) => ({
                name,
                conclusion: "success",
                completed_at: new Date(now - 1000).toISOString(),
              })),
              {
                name: "Check independent notification delivery and retry pending incidents",
                status: "in_progress",
                conclusion: null,
              },
            ],
          },
        ],
      }),
    );
  expect(await probeGithubDelivery({ fetcher, now })).toMatchObject({
    code: "OK",
    runId: 2,
    notifiedAt: new Date(now - 1000).toISOString(),
  });
});
function fixture(minutes = 1, notify = true) {
  const run = {
    id: 1,
    name: "Bookforest availability",
    head_branch: "main",
    event: "schedule",
    status: "completed",
  };
  return vi
    .fn()
    .mockResolvedValueOnce(Response.json({ workflow_runs: [run] }))
    .mockResolvedValueOnce(
      Response.json({
        jobs: [
          {
            name: "public-service",
            completed_at: new Date(now - minutes * 60000).toISOString(),
            steps: [
              "Notify one incident and its recovery",
              "Notify backup incident and recovery",
            ].map((name) => ({
              name,
              conclusion: notify ? "success" : "failure",
            })),
          },
        ],
      }),
    );
}
it("checks actual notification steps independently from service and backup health", async () => {
  expect(await probeGithubDelivery({ fetcher: fixture(), now })).toMatchObject({
    code: "OK",
    runId: 1,
  });
  expect(
    await probeGithubDelivery({ fetcher: fixture(61), now }),
  ).toMatchObject({ code: "GITHUB_CHECK_DELAYED" });
  expect(
    await probeGithubDelivery({ fetcher: fixture(1, false), now }),
  ).toMatchObject({ code: "GITHUB_NOTIFY_FAILED", notifiedAt: null });
});
it("does not turn an unavailable GitHub response into success", async () => {
  expect(
    await probeGithubDelivery({
      fetcher: async () => {
        throw Error("private provider text");
      },
      now,
    }),
  ).toEqual({
    code: "GITHUB_STATUS_UNAVAILABLE",
    runId: null,
    notifiedAt: null,
  });
});
it("reports rate limiting separately from delivery failure and permission errors", async () => {
  for (const [status, headers, code] of [
    [429, {}, "GITHUB_RATE_LIMITED"],
    [403, { "x-ratelimit-remaining": "0" }, "GITHUB_RATE_LIMITED"],
    [403, {}, "GITHUB_STATUS_UNAVAILABLE"],
  ] as const) {
    const fetcher = vi.fn(async () => new Response(null, { status, headers }));
    expect(await probeGithubDelivery({ fetcher, now })).toMatchObject({ code, runId: null });
    expect(fetcher).toHaveBeenCalledOnce();
  }
});
it("reconciles a lost POST response without duplicating a GitHub message", async () => {
  let stored: any;
  const fetcher = vi.fn(async (_url: any, o: any) => {
    if (o.method === "POST") {
      stored = JSON.parse(o.body);
      throw Error("lost response");
    }
    return Response.json([
      { number: 9, user: { type: "Bot" }, body: stored.body },
    ]);
  });
  const api = notificationClient({
    token: "fixture",
    fetcher,
    sleep: async () => {},
  });
  expect(await api("/issues", "POST", { body: "bounded alert" })).toMatchObject(
    { number: 9 },
  );
  expect(fetcher.mock.calls.filter((c) => c[1].method === "POST")).toHaveLength(
    1,
  );
});
it("retries transient reads with a bound, and never retries authorization denial", async () => {
  const sleep = vi.fn().mockResolvedValue(undefined),
    fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(Response.json([]));
  expect(
    await notificationClient({ token: "fixture", fetcher, sleep })("/issues"),
  ).toEqual([]);
  expect(sleep).toHaveBeenCalledOnce();
  const denied = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
  await expect(
    notificationClient({ token: "fixture", fetcher: denied, sleep })("/issues"),
  ).rejects.toThrow("GITHUB_NOTIFICATION_FAILED");
  expect(denied).toHaveBeenCalledOnce();
});
