import { libraryBookSchema, type LibraryBook } from "./classroom-tools";
import { normalizeIsbn } from "./book-metadata";
export function parseLibraryCsv(input: string): LibraryBook[] {
  if (new TextEncoder().encode(input).length > 100000)
    throw Error("CSV 파일은 100KB 이하로 준비해 주세요.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const text = input.replace(/^\uFEFF/, "");
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else if (ch === undefined) throw Error("따옴표가 닫히지 않았어요.");
      else cell += ch;
      continue;
    }
    if (ch === '"') {
      if (cell || closed) throw Error("CSV 따옴표 위치를 확인해 주세요.");
      quoted = true;
      continue;
    }
    if (ch === "," || ch === "\r" || ch === "\n" || ch === undefined) {
      row.push(cell.trim());
      cell = "";
      closed = false;
      if (ch !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (ch === "\r" && text[i + 1] === "\n") i++;
      }
      continue;
    }
    if (closed && ch.trim()) throw Error("닫힌 따옴표 뒤에는 쉼표가 필요해요.");
    if (!closed) cell += ch;
  }
  if (
    rows[0]?.join(",") !== "ISBN,제목,저자,위치,권수" ||
    rows.length < 2 ||
    rows.length > 101
  )
    throw Error(
      "첫 줄은 ISBN,제목,저자,위치,권수이며 한 번에 1~100권을 등록해 주세요.",
    );
  const seen = new Set<string>();
  return rows.slice(1).map((r, i) => {
    const isbn = normalizeIsbn(r[0] ?? "");
    if (r.length !== 5 || !isbn || seen.has(isbn))
      throw Error(i + 2 + "번째 줄의 ISBN·중복·열 수를 확인해 주세요.");
    seen.add(isbn);
    const parsed=libraryBookSchema.safeParse({
      isbn,
      title: r[1],
      author: r[2],
      location: r[3],
      copies: Number(r[4]),
    });
    if(!parsed.success)throw Error(i+2+"번째 줄의 제목·저자·위치 글자 수와 권수(1~999)를 확인해 주세요.");
    return parsed.data;
  });
}
