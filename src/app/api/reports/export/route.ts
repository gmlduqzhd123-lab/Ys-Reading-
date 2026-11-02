import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { accountReady } from "@/lib/account-access";
import { sameOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";
import { reportBundle, type GrowthReport } from "@/lib/growth-report";
import { docxBytes, csvText, printHtml } from "@/lib/export-documents";
import { googleExport } from "@/lib/google-drive";
import { googleExportFailure } from "@/lib/google-errors";
import { recordExport } from "@/lib/export-receipts";
const schema = z
  .object({
    id: z.uuid(),
    format: z.enum(["docx", "print", "csv", "google-docs", "google-sheets"]),
    requestId: z.uuid(),
  })
  .strict();
export async function POST(r: NextRequest) {
  if (!sameOrigin(r))
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 403 });
  const p = await getCurrentProfile();
  if (
    !accountReady(p) ||
    (p.role === "student" && p.consent_status !== "verified")
  )
    return NextResponse.json(
      { error: "참여 가능한 계정으로 로그인해 주세요." },
      { status: 401 },
    );
  try {
    const v = schema.parse(await r.json()),
      c = await createClient(),
      row = await c.from("term_reports").select("*").eq("id", v.id).single();
    if (row.error || !row.data) throw Error("BF_FORBIDDEN");
    const bundle = reportBundle(row.data as GrowthReport),
      receipt = {
        kind: "growth",
        ids: [v.id],
        format: v.format,
        title: bundle.title,
        requestId: v.requestId,
      };
    if (v.format.startsWith("google-")) {
      if (p.role !== "teacher") throw Error("BF_FORBIDDEN");
      const result = await googleExport(
        p.id,
        bundle,
        v.format === "google-sheets",
        v.requestId,
      );
      await recordExport(receipt, result.webViewLink);
      return NextResponse.json(
        { url: result.webViewLink },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const body =
        v.format === "docx"
          ? new Uint8Array(await docxBytes(bundle))
          : v.format === "csv"
            ? csvText(bundle)
            : printHtml(bundle),
      ext = v.format === "docx" ? "docx" : v.format === "csv" ? "csv" : "html";
    await recordExport(receipt);
    return new NextResponse(body, {
      headers: {
        "Content-Type":
          v.format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : v.format === "csv"
              ? "text/csv; charset=utf-8"
              : "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="bookforest-growth.${ext}"; filename*=UTF-8''${encodeURIComponent(bundle.title)}.${ext}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const google = googleExportFailure(e);
    if (google)
      return NextResponse.json(google.body, { status: google.status });
    return NextResponse.json(
      {
        error: String(e).includes("FORBIDDEN")
          ? "이 보고서를 내보낼 권한이 없습니다."
          : "보고서를 내보내지 못했어요. Google 계정 연결과 기록 접근 권한을 확인해 주세요.",
      },
      {
        status: String(e).includes("FORBIDDEN") ? 403 : 400,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
