import { it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  wrapRecoveryKey,
  unwrapRecoveryKey,
} from "../scripts/lib/recovery-key.mjs";
it("recovers the actual encryption key independently of Windows DPAPI and rejects tampering", () => {
  const key = randomBytes(32),
    p = "only-for-testing-this-recovery-passphrase",
    text = wrapRecoveryKey(key, p);
  expect(text).not.toContain(key.toString("hex"));
  expect(unwrapRecoveryKey(text, p)).toEqual(key);
  expect(() => unwrapRecoveryKey(text, "wrong passphrase")).toThrow(
    "RECOVERY_KEY_INTEGRITY_FAILED",
  );
  const changed = JSON.parse(text);
  changed.projectRef = "other";
  expect(() => unwrapRecoveryKey(JSON.stringify(changed), p)).toThrow(
    "RECOVERY_KEY_INTEGRITY_FAILED",
  );
  expect(() => wrapRecoveryKey(key, "short")).toThrow(
    "RECOVERY_PASSPHRASE_REQUIRED",
  );
});
