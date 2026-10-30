import "server-only";
import { bookSchema, type Book } from "./hub";
export async function searchBooks(
  q: string,
): Promise<{ books: Book[]; source: string }> {
  const providers = process.env.GOOGLE_BOOKS_API_KEY
    ? ["google", "openlibrary"]
    : ["openlibrary"];
  for (const provider of providers) {
    try {
      if (provider === "google") {
        const url = new URL("https://www.googleapis.com/books/v1/volumes");
        url.searchParams.set("q", q);
        url.searchParams.set("maxResults", "12");
        url.searchParams.set("printType", "books");
        url.searchParams.set("key", process.env.GOOGLE_BOOKS_API_KEY!);
        const r = await fetch(url, {
          signal: AbortSignal.timeout(6000),
          next: { revalidate: 3600 },
        });
        if (!r.ok) throw new Error("Provider unavailable");
        const data = await r.json();
        const books = (Array.isArray(data.items) ? data.items : []).flatMap(
          (item: { volumeInfo?: Record<string, any> }) => {
            const v = item.volumeInfo ?? {};
            let thumbnail = "";
            try {
              const image = new URL(v.imageLinks?.thumbnail ?? "");
              if (
                ["books.google.com", "books.googleusercontent.com"].includes(
                  image.hostname,
                )
              ) {
                image.protocol = "https:";
                thumbnail = image.toString();
              }
            } catch {}
            const parsed = bookSchema.safeParse({
              title: v.title,
              author: (v.authors ?? []).join(", ").slice(0, 200),
              publisher: (v.publisher ?? "").slice(0, 200),
              isbn:
                (v.industryIdentifiers ?? []).find(
                  (i: { type: string }) => i.type === "ISBN_13",
                )?.identifier ?? "",
              thumbnail,
            });
            return parsed.success ? [parsed.data] : [];
          },
        );
        if (books.length) return { books, source: "Google Books" };
      } else {
        const url = new URL("https://openlibrary.org/search.json");
        url.searchParams.set("q", q);
        url.searchParams.set("limit", "12");
        url.searchParams.set(
          "fields",
          "key,title,author_name,isbn,publisher,cover_i",
        );
        const r = await fetch(url, {
          headers: {
            "User-Agent":
              "Bookforest/0.1 (https://github.com/gmlduqzhd123-lab/Ys-Reading-)",
          },
          signal: AbortSignal.timeout(8000),
          next: { revalidate: 3600 },
        });
        if (!r.ok) throw new Error("Provider unavailable");
        const data = await r.json();
        if (!Array.isArray(data.docs))
          throw new Error("Invalid provider response");
        const books = data.docs.flatMap((v: Record<string, any>) => {
          const parsed = bookSchema.safeParse({
            title: v.title,
            author: (v.author_name ?? []).join(", ").slice(0, 200),
            publisher: (v.publisher?.[0] ?? "").slice(0, 200),
            isbn:
              (v.isbn ?? []).find((s: string) => /^\d{13}$/.test(s)) ??
              v.isbn?.[0] ??
              "",
            thumbnail:
              Number.isSafeInteger(v.cover_i) && v.cover_i > 0
                ? `https://covers.openlibrary.org/b/id/${v.cover_i}-M.jpg`
                : "",
          });
          return parsed.success ? [parsed.data] : [];
        });
        return { books, source: "Open Library" };
      }
    } catch {
      /* Try the configured secondary provider without inventing results. */
    }
  }
  throw new Error("BOOK_SEARCH_UNAVAILABLE");
}
