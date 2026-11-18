import { it, expect } from "vitest";
import { weekStart } from "../src/lib/weekly-summary";
it("uses Korean dates at the UTC Sunday/Monday boundary and rejects impossible dates", () => {
  expect(weekStart(undefined, Date.parse("2026-11-15T15:01:00Z"))).toBe(
    "2026-11-16",
  );
  expect(weekStart("2026-11-15")).toBe("2026-11-09");
  expect(() => weekStart("2026-02-30")).toThrow("WEEK_INVALID");
});
