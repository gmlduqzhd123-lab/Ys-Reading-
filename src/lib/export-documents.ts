import "server-only";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { z } from "zod";
import { requireProfile } from "./auth";
import { createClient } from "./supabase/server";
import { escapeHtml } from "./studio";
export const exportSchema = z
  .object({
    kind: z.enum(["reading", "writing", "drafts"]),
    ids: z.array(z.uuid()).min(1).max(100),
    format: z.enum(["docx", "print", "csv", "google-docs", "google-sheets"]),
    title: z.string().trim().min(1).max(100).default("나의 책숲 기록"),
    requestId: z.uuid(),
    includeNames: z.boolean().optional(),
  })
  .strict();
export interface ExportEntry {
  title: string;
  body: string;
  meta: string;
  question?: string;
}
export interface ExportBundle {
  title: string;
  entries: ExportEntry[];
}
export async function loadExportBundle(
  input: z.infer<typeof exportSchema>,
): Promise<ExportBundle> {
  const profile = await requireProfile();
  if (profile.role === "student" && profile.consent_status !== "verified")
    throw new Error("BF_CONSENT_REQUIRED");
  const client = await createClient();
  const ids = [...new Set(input.ids)];
  const table =
    input.kind === "reading"
      ? "reading_logs"
      : input.kind === "drafts"
        ? "drafts"
        : "submissions";
  const { data, error } = await client.from(table).select("*").in("id", ids);
  if (error || data?.length !== ids.length) throw new Error("BF_FORBIDDEN");
  const byId = new Map(data.map((r) => [r.id, r]));
  const names = new Map<string, string>();
  if (input.includeNames) {
    const response = await client
      .from("profiles")
      .select("id,display_name")
      .in("id", [...new Set(data.map((r) => r.student_id))]);
    if (response.error) throw new Error("BF_FORBIDDEN");
    for (const row of response.data ?? []) names.set(row.id, row.display_name);
  }
  return {
    title: input.title,
    entries: ids.map((id) => {
      const r = byId.get(id)!;
      return input.kind === "reading"
        ? {
            title: String(r.book.title),
            meta: `${names.has(r.student_id) ? `${names.get(r.student_id)} · ` : ""}${r.read_on} · ${r.book.author ?? ""} · ${r.book.publisher ?? ""} · ${r.book.isbn ?? ""}`,
            body: r.thought,
            question: r.question,
          }
        : {
            title: r.title || "작성 중인 글",
            meta: `${names.has(r.student_id) ? `${names.get(r.student_id)} · ` : ""}${new Date(r.updated_at ?? r.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} · ${input.kind === "drafts" ? "작성 중인 초안" : `${r.version}번째 글`}`,
            body: r.body,
          };
    }),
  };
}
export async function docxBytes(bundle: ExportBundle) {
  const children = [
    new Paragraph({ text: bundle.title, heading: HeadingLevel.TITLE }),
    new Paragraph("책숲 · 선택한 시점의 기록 사본"),
  ];
  for (const entry of bundle.entries) {
    children.push(
      new Paragraph({ text: entry.title, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        children: [
          new TextRun({ text: entry.meta, color: "666666", size: 20 }),
        ],
      }),
    );
    for (const line of entry.body.split(/\r?\n/))
      children.push(new Paragraph(line));
    if (entry.question)
      children.push(
        new Paragraph({
          text: "더 생각해 볼 질문",
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph(entry.question),
      );
  }
  return Packer.toBuffer(
    new Document({
      styles: {
        default: { document: { run: { font: "맑은 고딕", size: 22 } } },
      },
      sections: [{ children }],
    }),
  );
}
export function csvCell(text: string) {
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function csvText(bundle: ExportBundle) {
  return (
    "\uFEFF" +
    exportRows(bundle)
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
export function exportRows(bundle: ExportBundle): string[][] {
  return [
    ["제목", "읽은 날·책 정보 / 작성 버전", "나의 생각·글", "질문"],
    ...bundle.entries.map((e) => [e.title, e.meta, e.body, e.question ?? ""]),
  ];
}
export function printHtml(bundle: ExportBundle) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escapeHtml(bundle.title)}</title><style>@page{size:A4;margin:20mm}body{font:12pt/1.9 'Malgun Gothic',sans-serif;color:#20382d}section{break-before:page}p{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#666}button{padding:12px}@media print{button{display:none}}</style><body><button onclick="window.print()">인쇄 · PDF로 저장</button><h1>${escapeHtml(bundle.title)}</h1><p>책숲 · 선택한 시점의 기록 사본</p>${bundle.entries.map((e) => `<section><h2>${escapeHtml(e.title)}</h2><small>${escapeHtml(e.meta)}</small><p>${escapeHtml(e.body)}</p>${e.question ? `<h3>더 생각해 볼 질문</h3><p>${escapeHtml(e.question)}</p>` : ""}</section>`).join("")}</body></html>`;
}
