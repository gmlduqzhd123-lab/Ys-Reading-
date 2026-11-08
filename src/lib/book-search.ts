import "server-only";
import type { Book } from "./hub";
import { cleanBookText, normalizeBooks, normalizeIsbn } from "./book-metadata";
type Provider = "aladin" | "kakao" | "google" | "openlibrary";
export function domesticBookSearchConfigured() {
  return Boolean(process.env.ALADIN_TTB_KEY || process.env.KAKAO_BOOK_REST_KEY);
}
export async function searchBooks(
  query: string,
): Promise<{ books: Book[]; source: string; domesticConfigured: boolean }> {
  const compact = query
    .replace(/^ISBN(?:-1[03])?:?\s*/i, "")
    .replace(/[\s-]/g, "");
  const isbn = normalizeIsbn(query) ?? undefined;
  if (/^(?:\d{13}|\d{9}[\dXx])$/.test(compact) && !isbn)
    throw Error("BOOK_ISBN_INVALID");
  const q = isbn ?? query.trim(),
    providers: Provider[] = [
      ...(process.env.ALADIN_TTB_KEY ? ["aladin" as const] : []),
      ...(process.env.KAKAO_BOOK_REST_KEY ? ["kakao" as const] : []),
      ...(process.env.GOOGLE_BOOKS_API_KEY ? ["google" as const] : []),
      "openlibrary",
    ];
  let emptySource: string | undefined;
  for (const provider of providers) {
    try {
      let rows: unknown[], source: string;
      if (provider === "aladin") {
        const url = new URL(
          "https://www.aladin.co.kr/ttb/api/" +
            (isbn ? "ItemLookUp.aspx" : "ItemSearch.aspx"),
        );
        const parameters: Record<string, string> = {
          ttbkey: process.env.ALADIN_TTB_KEY!,
          output: "js",
          Version: "20131101",
          Cover: "MidBig",
        };
        if (isbn) {
          parameters.ItemId = isbn;
          parameters.itemIdType = "ISBN13";
        } else
          Object.assign(parameters, {
            Query: q,
            QueryType: "Keyword",
            MaxResults: "12",
            start: "1",
            SearchTarget: "Book",
          });
        for (const [k, v] of Object.entries(parameters))
          url.searchParams.set(k, v);
        const r = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) throw Error();
        const d = await r.json();
        if (!Array.isArray(d.item) || d.errorCode) throw Error();
        rows = d.item.map((b: Record<string, unknown>) => ({
          title: cleanBookText(b.title),
          author: cleanBookText(b.author),
          publisher: cleanBookText(b.publisher),
          isbn: String(b.isbn13 || b.isbn || ""),
          thumbnail: b.cover || "",
        }));
        source = "알라딘";
      } else if (provider === "kakao") {
        const url = new URL("https://dapi.kakao.com/v3/search/book");
        url.searchParams.set("query", q);
        url.searchParams.set("size", "12");
        if (isbn) url.searchParams.set("target", "isbn");
        const r = await fetch(url, {
          headers: {
            Authorization: "KakaoAK " + process.env.KAKAO_BOOK_REST_KEY,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) throw Error();
        const d = await r.json();
        if (!Array.isArray(d.documents)) throw Error();
        rows = d.documents.map((b: Record<string, unknown>) => ({
          title: cleanBookText(b.title),
          author: cleanBookText(
            Array.isArray(b.authors) ? b.authors.join(", ") : "",
          ),
          publisher: cleanBookText(b.publisher),
          isbn:
            String(b.isbn ?? "")
              .split(/\s+/)
              .find((x) => !!normalizeIsbn(x)) ?? "",
          thumbnail: b.thumbnail || "",
        }));
        source = "카카오 도서 검색";
      } else if (provider === "google") {
        const url = new URL("https://www.googleapis.com/books/v1/volumes");
        url.searchParams.set("q", isbn ? "isbn:" + isbn : q);
        url.searchParams.set("maxResults", "12");
        url.searchParams.set("printType", "books");
        url.searchParams.set("key", process.env.GOOGLE_BOOKS_API_KEY!);
        if (!isbn && /[가-힣]/.test(q))
          url.searchParams.set("langRestrict", "ko");
        const r = await fetch(url, {
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        });
        if (!r.ok) throw Error();
        const d = await r.json();
        if (d.items !== undefined && !Array.isArray(d.items)) throw Error();
        rows = (d.items ?? []).map(
          (item: { volumeInfo?: Record<string, any> }) => {
            const v = item.volumeInfo ?? {};
            return {
              title: cleanBookText(v.title),
              author: cleanBookText((v.authors ?? []).join(", ")),
              publisher: cleanBookText(v.publisher),
              isbn:
                v.industryIdentifiers?.find((i: { identifier: string }) =>
                  normalizeIsbn(i.identifier),
                )?.identifier ?? "",
              thumbnail: v.imageLinks?.thumbnail ?? "",
            };
          },
        );
        source = "Google Books";
      } else {
        const url = new URL("https://openlibrary.org/search.json");
        url.searchParams.set(isbn ? "isbn" : "q", q);
        url.searchParams.set("limit", "12");
        url.searchParams.set(
          "fields",
          "key,title,author_name,isbn,publisher,cover_i",
        );
        const r = await fetch(url, {
          headers: {
            "User-Agent":
              "Bookforest/0.2 (https://github.com/gmlduqzhd123-lab/Ys-Reading-)",
          },
          signal: AbortSignal.timeout(7000),
          next: { revalidate: 3600 },
        });
        if (!r.ok) throw Error();
        const d = await r.json();
        if (!Array.isArray(d.docs)) throw Error();
        rows = d.docs.map((v: Record<string, any>) => ({
          title: cleanBookText(v.title),
          author: cleanBookText((v.author_name ?? []).join(", ")),
          publisher: cleanBookText(v.publisher?.[0]),
          isbn: (v.isbn ?? []).find((s: string) => normalizeIsbn(s)) ?? "",
          thumbnail:
            Number.isSafeInteger(v.cover_i) && v.cover_i > 0
              ? `https://covers.openlibrary.org/b/id/${v.cover_i}-M.jpg`
              : "",
        }));
        source = "Open Library";
      }
      const books = normalizeBooks(rows, isbn);
      if (books.length)
        return {
          books,
          source,
          domesticConfigured: domesticBookSearchConfigured(),
        };
      emptySource = source;
    } catch {
      /* Provider bodies and API keys never enter logs or client errors. */
    }
  }
  if (emptySource)
    return {
      books: [],
      source: emptySource,
      domesticConfigured: domesticBookSearchConfigured(),
    };
  throw Error("BOOK_SEARCH_UNAVAILABLE");
}
