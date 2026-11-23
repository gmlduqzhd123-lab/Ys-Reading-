import { describe, expect, it } from "vitest";
import { exportSelectionKey, readExportSelection } from "@/lib/export-selection";

const first = "b88aab36-83e7-4083-8aee-b27f84704c43";
const second = "f4e9fe5b-f042-4af8-9193-2b888e9ab078";
const now = 2_000_000;
const choice = { kind: "reading", title: "우리 반 기록장", ids: [second, first, second], savedAt: now };

describe("resume an export after authorization", () => {
  it("preserves only currently exportable records in selection order", () => {
    const allowed = { reading: new Set([second]), writing: new Set([first]) };
    expect(readExportSelection(JSON.stringify(choice), now, allowed))
      .toMatchObject({ title: choice.title, ids: [second], omitted: true });
    const both = { ...allowed, reading: new Set([first, second]) };
    expect(readExportSelection(JSON.stringify(choice), now, both)?.ids).toEqual([second, first]);
  });

  it("isolates account, classroom and page, rejecting expired or malformed snapshots", () => {
    expect(new Set([
      exportSelectionKey("one", first, 1), exportSelectionKey("two", first, 1),
      exportSelectionKey("one", second, 1), exportSelectionKey("one", first, 2),
    ]).size).toBe(4);
    const allowed = { reading: new Set([second]), writing: new Set<string>() };
    expect(readExportSelection(JSON.stringify(choice), now + 900_001, allowed)).toBeNull();
    expect(readExportSelection(JSON.stringify({ ...choice, includeNames: true }), now, allowed)).toBeNull();
  });
});
