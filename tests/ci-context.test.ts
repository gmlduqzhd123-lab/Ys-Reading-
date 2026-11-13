import { it, expect } from "vitest";
import { redactBrowserContext } from "../scripts/lib/ci-context.mjs";
it("removes family capabilities, JWTs and service keys from isolated failure diagnostics", () => {
  const token = "ab".repeat(32),
    result = redactBrowserContext(
      "/family#" + token + " eyJhbGci.test.signature sb_secret_testfixture",
    );
  expect(result).not.toContain(token);
  expect(result).not.toContain("eyJhbGci");
  expect(result).not.toContain("sb_secret_");
  expect(result).toContain("/family#");
});
