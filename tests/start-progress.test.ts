import { it, expect } from "vitest";
import { readStartProgress } from "../src/lib/start-progress";
const user = "11111111-1111-4111-8111-111111111111",
  classroom = "22222222-2222-4222-8222-222222222222";
it("resumes only the same account and available class without replaying volatile password steps", () => {
  const raw = JSON.stringify({
    version: 1,
    user,
    classroom,
    step: 4,
    savedAt: 1000,
  });
  expect(readStartProgress(raw, user, [classroom], 2000)?.step).toBe(2);
  expect(readStartProgress(raw, classroom, [classroom], 2000)).toBeNull();
  expect(readStartProgress(raw, user, [], 2000)).toBeNull();
  expect(readStartProgress(raw, user, [classroom], 86402000)).toBeNull();
  expect(
    readStartProgress(
      JSON.stringify({ ...JSON.parse(raw), password: "private" }),
      user,
      [classroom],
      2000,
    ),
  ).toBeNull();
});
