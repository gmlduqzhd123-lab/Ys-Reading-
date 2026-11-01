import { describe, it, expect } from "vitest";
import {
  evolution,
  nextPeriod,
  growthTermInput,
  growthTermError,
} from "../src/lib/growth-terms";
describe("Character evolution and term input", () => {
  it("uses the XP level boundaries without spending XP", () => {
    expect(
      [0, 49, 50, 449, 450, 1249, 1250, 8000].map((x) => evolution(x).stage),
    ).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(evolution(1250).nextXp).toBe(null);
  });
  it("rolls over the academic year only after semester two", () => {
    expect(nextPeriod(2026, 1)).toEqual({ year: 2026, semester: 2 });
    expect(nextPeriod(2026, 2)).toEqual({ year: 2027, semester: 1 });
  });
  it("rejects unknown commands and missing retry identities", () => {
    expect(
      growthTermInput.safeParse({ command: "grant_item", payload: {} }).success,
    ).toBe(false);
    expect(
      growthTermInput.safeParse({
        command: "equip",
        requestId: "bad",
        payload: {},
      }).success,
    ).toBe(false);
  });
  it("shows actionable conflict and archive errors", () => {
    expect(growthTermError({ message: "BF_PENDING_ORDERS" })).toContain(
      "지급하거나 취소",
    );
    expect(growthTermError({ message: "BF_CHARACTER_CONFLICT" })).toContain(
      "새로고침",
    );
  });
});
