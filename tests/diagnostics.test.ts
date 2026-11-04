import { it, expect } from "vitest";
import { safeErrorDigest } from "../src/lib/diagnostics";
it("accepts only bounded opaque IDs, never exception text or student data", () => {
  expect(safeErrorDigest({ digest: "153376432" })).toBe("153376432");
  for (const error of [
    new Error("student writing"),
    { digest: "name@example.com" },
    { digest: "secret\nkey" },
    { digest: "a".repeat(65) },
    null,
  ])
    expect(safeErrorDigest(error)).toBeNull();
});
