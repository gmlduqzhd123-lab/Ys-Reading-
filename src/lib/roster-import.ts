export interface RosterRow {
  row: number;
  loginId: string;
  name: string;
  errors: string[];
}
export function parseRosterCsv(
  input: string,
  existing: string[] = [],
): RosterRow[] {
  if (input.length > 512000)
    throw Error("CSV 파일은 500KB 이하로 준비해 주세요.");
  const records: string[][] = [];
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
      } else if (ch === undefined) throw Error("따옴표가 닫히지 않은 CSV예요.");
      else cell += ch;
      continue;
    }
    if (ch === '"') {
      if (cell || closed) throw Error("CSV의 따옴표 위치를 확인해 주세요.");
      quoted = true;
      continue;
    }
    if (ch === "," || ch === "\n" || ch === "\r" || ch === undefined) {
      row.push(cell);
      cell = "";
      closed = false;
      if (ch !== ",") {
        if (row.some((c) => c.trim())) records.push(row);
        row = [];
        if (ch === "\r" && text[i + 1] === "\n") i++;
      }
      continue;
    }
    if (closed && ch.trim()) throw Error("닫힌 따옴표 뒤에는 쉼표가 필요해요.");
    if (!closed) cell += ch;
  }
  if (
    records[0]?.[0]?.trim() !== "아이디" ||
    records[0]?.[1]?.trim() !== "별칭" ||
    records[0].length !== 2
  )
    throw Error("첫 줄은 ‘아이디,별칭’으로 준비해 주세요.");
  if (records.length < 2 || records.length > 301)
    throw Error("한 파일에 학생 1~300명을 준비해 주세요.");
  const reserved = new Set(existing),
    counts = new Map<string, number>();
  for (const r of records.slice(1)) {
    const id = (r[0] ?? "").trim().toLowerCase();
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return records.slice(1).map((r, i) => {
    const loginId = (r[0] ?? "").trim().toLowerCase(),
      name = (r[1] ?? "").trim(),
      errors: string[] = [];
    if (r.length !== 2) errors.push("아이디·별칭 두 칸이 필요해요");
    if (!/^[a-z0-9][a-z0-9_-]{3,31}$/.test(loginId))
      errors.push("아이디는 소문자·숫자·_·-를 사용한 4~32자예요");
    if (!name || name.length > 40) errors.push("별칭은 1~40자예요");
    if ((counts.get(loginId) ?? 0) > 1)
      errors.push("파일 안에서 아이디가 중복돼요");
    if (reserved.has(loginId)) errors.push("이미 발급한 아이디예요");
    return { row: i + 2, loginId, name, errors };
  });
}
export function rosterCsv(
  rows: { loginId: string; name: string; password: string }[],
) {
  const cell = (s: string) =>
    '"' + (/^[\s]*[=+\-@]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"';
  return (
    "\uFEFF" +
    [
      ["아이디", "별칭", "초기 비밀번호"],
      ...rows.map((r) => [r.loginId, r.name, r.password]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}
