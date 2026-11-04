import { describe, it, expect } from "vitest";
import {
  monitorCheckStale,
  refreshMonitor,
  monitorLabel,
  type MonitorState,
} from "../src/lib/monitoring";
describe("monitor freshness independent of serialized flags and browser cache", () => {
  const now = Date.parse("2026-11-04T07:00:00Z");
  const state = (at: string): MonitorState => ({
    asOf: at,
    checks: [
      {
        source: "supabase-cron",
        checked_at: at,
        healthy: true,
        code: "HEALTHY",
        stale: false,
      },
    ],
    incidents: [],
  });
  it("never presents yesterday cached healthy flag as current", () => {
    const v = state("2026-11-03T07:00:00Z");
    expect(refreshMonitor(v, now)?.checks[0].stale).toBe(true);
    expect(monitorLabel(v, now)).toContain("오래됐어요");
  });
  it("expires at 12 minutes and rejects invalid or future timestamps", () => {
    for (const at of [
      "",
      "bad",
      "2026-11-04T06:48:00Z",
      "2026-11-04T07:01:01Z",
    ])
      expect(monitorCheckStale({ checked_at: at }, now)).toBe(true);
    expect(monitorCheckStale({ checked_at: "2026-11-04T06:49:00Z" }, now)).toBe(
      false,
    );
    expect(refreshMonitor(null, now)).toBeNull();
  });
});
