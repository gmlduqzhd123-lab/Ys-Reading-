import { describe, it, expect } from "vitest";
import { parseRosterCsv, rosterCsv } from "../src/lib/roster-import";
describe("Roster CSV preview", () => {
  it("accepts UTF-8 BOM, Korean aliases and quoted comma/newline cells", () => {
    const rows = parseRosterCsv(
      '\uFEFF아이디,별칭\r\nSTU_01,"새싹, 친구"\r\nstu_02,"책\n나무"',
    );
    expect(rows[0]).toMatchObject({
      loginId: "stu_01",
      name: "새싹, 친구",
      errors: [],
    });
    expect(rows[1].name).toBe("책\n나무");
  });
  it("marks duplicate, existing, invalid IDs and missing aliases without issuing accounts", () => {
    const rows = parseRosterCsv(
      "아이디,별칭\nstu01,새싹\nstu01,책\nexisting,나무\nbad!,\n",
      ["existing"],
    );
    expect(rows.every((r) => r.errors.length > 0)).toBe(true);
  });
  it("rejects malformed quoting, wrong headers and too many students", () => {
    expect(() =>
      parseRosterCsv('아이디,별칭\nstu01,"닫히지 않은 이름'),
    ).toThrow("따옴표");
    expect(() => parseRosterCsv("이름,암호\n학생,암호")).toThrow("첫 줄");
    expect(() =>
      parseRosterCsv(
        "아이디,별칭\n" +
          Array.from({ length: 301 }, (_, i) => `student${i},학생`).join("\n"),
      ),
    ).toThrow("1~300");
  });
  it("escapes credential exports against spreadsheet formulas and quoted names", () => {
    expect(
      rosterCsv([
        { loginId: "student01", name: "=SUM(1,2)", password: 'Aa"123456789' },
      ]),
    ).toContain('"\'=SUM(1,2)"');
    expect(
      rosterCsv([
        { loginId: "student01", name: "새싹", password: 'Aa"123456789' },
      ]),
    ).toContain('Aa""123456789');
  });
});
