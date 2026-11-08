import { it, expect, vi, afterEach } from "vitest";
import { learningPoller } from "../src/lib/learning-polling";
afterEach(() => vi.useRealTimers());
it("coalesces a resume event during an in-flight read and immediately checks the new version", async () => {
  vi.useFakeTimers();
  let resolve!: (v: string) => void;
  const pending = new Promise<string>((r) => (resolve = r)),
    changed = vi.fn(),
    read = vi.fn().mockReturnValueOnce(pending).mockResolvedValue("B");
  const p = learningPoller({
    read,
    available: () => true,
    changed,
    initial: "A",
  });
  p.start();
  p.refresh();
  p.refresh();
  expect(read).toHaveBeenCalledTimes(1);
  resolve("A");
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(2);
  expect(changed).toHaveBeenCalledTimes(1);
  p.stop();
  await vi.advanceTimersByTimeAsync(600000);
  expect(read).toHaveBeenCalledTimes(2);
});
it("detects a version changed during rendering on the first probe", async () => {
  vi.useFakeTimers();
  const changed = vi.fn(),
    p = learningPoller({
      read: async () => "B",
      available: () => true,
      changed,
      initial: "A",
    });
  p.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).toHaveBeenCalledTimes(1);
  p.stop();
});
it("waits offline, backs off failures, and never reports a late response after cleanup", async () => {
  vi.useFakeTimers();
  let available = false;
  const read = vi.fn().mockRejectedValue(Error()),
    changed = vi.fn(),
    p = learningPoller({
      read,
      available: () => available,
      changed,
      initial: "A",
    });
  p.start();
  expect(read).not.toHaveBeenCalled();
  available = true;
  p.refresh();
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(2);
  p.stop();
  expect(changed).not.toHaveBeenCalled();
  let resolve!: (v: string) => void;
  const late = new Promise<string>((r) => (resolve = r)),
    q = learningPoller({
      read: () => late,
      available: () => true,
      changed,
      initial: "A",
    });
  q.start();
  q.stop();
  resolve("B");
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).not.toHaveBeenCalled();
});
