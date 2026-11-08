import { bookSchema, type Book } from "./hub";
export function normalizeIsbn(value: string): string | null {
  const raw = value
    .replace(/^ISBN(?:-1[03])?:?\s*/i, "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (/^\d{13}$/.test(raw)) {
    const sum = [...raw.slice(0, 12)].reduce(
      (n, d, i) => n + Number(d) * (i % 2 ? 3 : 1),
      0,
    );
    return (10 - (sum % 10)) % 10 === Number(raw[12]) ? raw : null;
  }
  if (
    /^\d{9}[\dX]$/.test(raw) &&
    [...raw].reduce(
      (n, d, i) => n + (d === "X" ? 10 : Number(d)) * (10 - i),
      0,
    ) %
      11 ===
      0
  ) {
    const base = "978" + raw.slice(0, 9),
      sum = [...base].reduce((n, d, i) => n + Number(d) * (i % 2 ? 3 : 1), 0);
    return base + ((10 - (sum % 10)) % 10);
  }
  return null;
}
export function cleanBookText(value: unknown, max = 200) {
  return typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
}
export function safeBookThumbnail(value: unknown) {
  try {
    const u = new URL(String(value));
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (u.username || u.password) return "";
    const host = u.hostname;
    if (
      ![
        "books.google.com",
        "books.googleusercontent.com",
        "covers.openlibrary.org",
        "image.aladin.co.kr",
      ].includes(host) &&
      !host.endsWith(".kakaocdn.net")
    )
      return "";
    u.protocol = "https:";
    return u.toString();
  } catch {
    return "";
  }
}
export function normalizeBooks(rows: unknown[], isbn?: string): Book[] {
  const result: Book[] = [],
    seen = new Set<string>();
  for (const raw of rows) {
    const p = bookSchema.safeParse(raw);
    if (!p.success) continue;
    const b = {
      ...p.data,
      title: cleanBookText(p.data.title),
      author: cleanBookText(p.data.author),
      publisher: cleanBookText(p.data.publisher),
      isbn: normalizeIsbn(p.data.isbn) || "",
      thumbnail: safeBookThumbnail(p.data.thumbnail),
    };
    if (!b.title || (isbn && b.isbn !== isbn)) continue;
    const key =
      b.isbn ||
      [b.title, b.author, b.publisher]
        .map((s) => s.toLocaleLowerCase().replace(/\s/g, ""))
        .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(b);
    if (result.length === 12) break;
  }
  return result;
}
