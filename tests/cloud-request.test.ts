import { it, expect } from "vitest";
import { readCloudJob } from "../supabase/functions/_shared/cloud-request.mjs";
const job = "10000000-0000-4000-8000-000000000001";
it("accepts only the bounded one-capability request", async () => {
  expect(
    await readCloudJob(
      new Request("https://test.invalid", {
        method: "POST",
        body: JSON.stringify({ job }),
      }),
    ),
  ).toBe(job);
  await expect(
    readCloudJob(
      new Request("https://test.invalid", {
        method: "POST",
        body: JSON.stringify({ job, extra: true }),
      }),
    ),
  ).rejects.toThrow();
  await expect(
    readCloudJob(new Request("https://test.invalid")),
  ).rejects.toThrow();
});
it("stops a stream without Content-Length before consuming an unbounded body", async () => {
  let canceled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(301));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("https://test.invalid", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  await expect(readCloudJob(request)).rejects.toThrow("INVALID_REQUEST");
  expect(canceled).toBe(true);
});
