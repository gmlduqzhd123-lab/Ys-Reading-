import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { searchBooks } from "@/lib/book-search";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Book providers", () => {
  it("prioritizes a configured domestic provider, hides keys and deduplicates editions",async()=>{
    vi.stubEnv("KAKAO_BOOK_REST_KEY","test-private-key");
    const item={title:"어린 왕자",authors:["작가"],publisher:"출판사",isbn:"0306406152 9780306406157",thumbnail:"https://search1.kakaocdn.net/image.jpg"};
    const f=vi.fn().mockResolvedValue({ok:true,json:async()=>({documents:[item,item]})});vi.stubGlobal("fetch",f);
    const r=await searchBooks("978-0-306-40615-7");expect(r.source).toBe("카카오 도서 검색");expect(r.books).toHaveLength(1);expect(r.books[0].isbn).toBe("9780306406157");expect(JSON.stringify(r)).not.toContain("test-private-key");expect(String(f.mock.calls[0][0])).toContain("target=isbn");
  });
  it("uses Aladin ISBN lookup and rejects incorrect ISBN before contacting providers",async()=>{
    vi.stubEnv("ALADIN_TTB_KEY","test-private-key");const f=vi.fn().mockResolvedValue({ok:true,json:async()=>({item:[{title:"책",author:"작가",publisher:"출판사",isbn13:"9780306406157",cover:""}]})});vi.stubGlobal("fetch",f);
    expect((await searchBooks("9780306406157")).source).toBe("알라딘");expect(String(f.mock.calls[0][0])).toContain("ItemLookUp.aspx");await expect(searchBooks("9780306406158")).rejects.toThrow("BOOK_ISBN_INVALID");expect(f).toHaveBeenCalledOnce();
  });
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
