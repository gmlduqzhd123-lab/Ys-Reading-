import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveBackupCodex } from "../scripts/lib/backup-runtime.mjs";
it("recovers when the task's versioned Codex executable and PATH target disappear", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bookforest-runtime-"));
  try {
    const bin = path.join(dir, "OpenAI", "Codex", "bin", "new-version");
    fs.mkdirSync(bin, { recursive: true });
    const binary = path.join(bin, "codex.exe");
    fs.writeFileSync(binary, "fixture");
    expect(
      resolveBackupCodex({
        localAppData: dir,
        override: path.join(dir, "old", "codex.exe"),
        commandPath: path.join(dir, "removed.exe"),
      }),
    ).toBe(binary);
    fs.unlinkSync(binary);
    expect(() =>
      resolveBackupCodex({ localAppData: dir, commandPath: null }),
    ).toThrow("BACKUP_CODEX_UNAVAILABLE");
  } finally {
    const expected = path.resolve(os.tmpdir()) + path.sep;
    if (!path.resolve(dir).startsWith(expected))
      throw Error("TEST_SCOPE_MISMATCH");
    fs.rmSync(dir, { recursive: true });
  }
});
