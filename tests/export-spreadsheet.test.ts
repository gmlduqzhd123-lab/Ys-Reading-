import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { xlsxBytes } from "@/lib/export-spreadsheet";
describe("Google Sheets import workbook", () => {
  it("keeps selected order, Korean paragraphs, quotes and formula-like text as literal cells", async () => {
    const zip = await JSZip.loadAsync(await xlsxBytes({ title: "가상 기록", entries: [
      { title: "첫째", meta: "2026-10-31", body: '한글 & <생각> "질문"\n둘째 줄 🌱', question: "=1+1" },
      { title: "둘째", meta: "두 번째 버전", body: "본문" },
    ] }));
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet.indexOf("첫째")).toBeLessThan(sheet.indexOf("둘째</t>"));
    expect(sheet).toContain("한글 &amp; &lt;생각&gt; &quot;질문&quot;\n둘째 줄 🌱");
    expect(sheet).toContain('<c r="D2" s="1" t="inlineStr"><is><t xml:space="preserve">=1+1</t>');
    expect(sheet).not.toMatch(/<f[ >]/);
    expect(await zip.file("xl/workbook.xml")!.async("string")).toContain('name="책숲 기록"');
  });
  it("provides readable widths, wrapped rows, header styling and a frozen first row", async () => {
    const zip = await JSZip.loadAsync(await xlsxBytes({ title: "가상 기록", entries: [{ title: "제목", meta: "정보", body: "긴 글\n".repeat(300) }] }));
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    const styles = await zip.file("xl/styles.xml")!.async("string");
    expect(sheet).toContain('width="64"');
    expect(sheet).toContain('ySplit="1"');
    expect(sheet).toContain('ht="409"');
    expect(styles).toContain('wrapText="1"');
    expect(styles).toContain('rgb="FF70586D"');
  });
});
