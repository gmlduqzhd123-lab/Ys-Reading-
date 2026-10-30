import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { searchBooks } from "@/lib/book-search";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Book providers", () => {
  it("searches without a Google key and maps ISBN metadata", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "");
    const fetcher = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          docs: [
            {
              title: "어린왕자",
              author_name: ["생텍쥐페리"],
              isbn: ["9788970555201"],
              publisher: ["출판사"],
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetcher);
    const result = await searchBooks("어린왕자");
    expect(String(fetcher.mock.calls[0][0])).toContain("openlibrary.org");
    expect(result.books[0].isbn).toBe("9788970555201");
    expect(result.source).toBe("Open Library");
  });
  it("recovers a Google quota error through the secondary provider", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            docs: [{ title: "책", author_name: ["저자"] }],
          }),
        }),
    );
    expect((await searchBooks("책 이름")).source).toBe("Open Library");
  });
  it("distinguishes no matching books from provider failure", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }),
    );
    expect((await searchBooks("검색결과없음")).books).toEqual([]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(searchBooks("책")).rejects.toThrow("BOOK_SEARCH_UNAVAILABLE");
  });
});
