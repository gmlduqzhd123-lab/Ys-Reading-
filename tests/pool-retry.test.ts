import { afterEach, expect, it, vi } from "vitest";
import { createPoolRetryFetch } from "../src/lib/supabase/pool-retry";
const url = "https://test.supabase.co/rest/v1/rpc/hub_command";
const waiting = () => Response.json({ code: "PGRST003" }, { status: 504 });
afterEach(() => vi.restoreAllMocks());
it("retries an unexecuted pool timeout with the identical POST body and headers", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const bodies: string[] = [],
    headers: string[] = [];
  const base = vi.fn<typeof fetch>(async (input) => {
    const request = input as Request;
    bodies.push(await request.text());
    headers.push(request.headers.get("Authorization")!);
    return bodies.length === 1
      ? waiting()
      : Response.json({ id: "saved-once" });
  });
  const request = new Request(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer synthetic-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_request_id: "unchanged-request" }),
  });
  const response = await createPoolRetryFetch(base)(request);
  expect(await response.json()).toEqual({ id: "saved-once" });
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
  expect(headers).toEqual(["Bearer synthetic-test", "Bearer synthetic-test"]);
  expect(request.bodyUsed).toBe(false);
});
it("stops after three pool retries and returns the final error for normal recovery", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const base = vi.fn<typeof fetch>().mockImplementation(async () => waiting());
  const retries = vi.fn();
  const response = await createPoolRetryFetch(base, retries)(url);
  expect(base).toHaveBeenCalledTimes(4);
  expect(retries.mock.calls).toEqual([[1], [2], [3]]);
  expect(await response.json()).toEqual({ code: "PGRST003" });
});
it.each([
  [403, "BF_FORBIDDEN"],
  [400, "BF_IDEMPOTENCY_CONFLICT"],
  [504, "UNKNOWN"],
  [500, "57014"],
])("does not replay a status %s failure with code %s", async (status, code) => {
  const base = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ code }, { status }));
  const response = await createPoolRetryFetch(base)(url);
  expect(base).toHaveBeenCalledTimes(1);
  expect(await response.json()).toEqual({ code });
});
it("does not retry an authentication endpoint or an ambiguous network exception", async () => {
  const auth = vi.fn<typeof fetch>().mockResolvedValue(waiting());
  await createPoolRetryFetch(auth)("https://test.supabase.co/auth/v1/token");
  expect(auth).toHaveBeenCalledTimes(1);
  const network = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new TypeError("network"));
  await expect(createPoolRetryFetch(network)(url)).rejects.toThrow("network");
  expect(network).toHaveBeenCalledTimes(1);
});
it("does not retry a request that was cancelled", async () => {
  const controller = new AbortController();
  const base = vi.fn<typeof fetch>().mockImplementation(async () => {
    controller.abort();
    return waiting();
  });
  await createPoolRetryFetch(base)(url, { signal: controller.signal });
  expect(base).toHaveBeenCalledTimes(1);
});
