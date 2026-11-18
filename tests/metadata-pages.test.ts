import { it, expect, vi } from "vitest";
import { metadataPages } from "../src/lib/metadata-pages";
it("reads all authorized metadata beyond the former 1000-row cutoff", async () => {
  const data = Array.from({ length: 1207 }, (_, id) => ({ id })),
    read = vi.fn(async (a: number, b: number) => ({
      data: data.slice(a, b + 1),
      error: null,
    }));
  const r = await metadataPages(read);
  expect(r.data).toHaveLength(1207);
  expect(read).toHaveBeenCalledTimes(3);
  expect(r.data[1206].id).toBe(1206);
});
it("does not expose an incomplete roster as a complete result after a page failure", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({ data: Array(500).fill({ id: 1 }), error: null })
    .mockResolvedValueOnce({ data: null, error: { code: "permission" } });
  expect(await metadataPages(read)).toEqual({
    data: [],
    error: { code: "permission" },
  });
});
