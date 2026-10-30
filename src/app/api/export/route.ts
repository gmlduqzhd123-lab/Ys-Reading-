import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  exportSchema,
  loadExportBundle,
  docxBytes,
  csvText,
  printHtml,
} from "@/lib/export-documents";
import { googleExport } from "@/lib/google-drive";
import { sameOrigin } from "@/lib/request-origin";
export async function POST(r: NextRequest) {
  if (!sameOrigin(r))
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 403 });
  const p = await getCurrentProfile();
  if (!p || (p.role === "student" && p.consent_status !== "verified"))
    return NextResponse.json(
      { error: "참여 가능한 계정으로 로그인해 주세요." },
      { status: 401 },
    );
  try {
    const input = exportSchema.parse(await r.json());
    const bundle = await loadExportBundle(input);
    if (input.format.startsWith("google-")) {
      if (p.role !== "teacher")
        return NextResponse.json(
          { error: "Google 내보내기는 연결한 교사 계정에서 이용합니다." },
          { status: 403 },
        );
      const result = await googleExport(
        p.id,
        bundle,
        input.format === "google-sheets",
        input.requestId,
      );
      return NextResponse.json({ url: result.webViewLink });
    }
    const type =
      input.format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : input.format === "csv"
          ? "text/csv; charset=utf-8"
          : "text/html; charset=utf-8";
    const body =
      input.format === "docx"
        ? new Uint8Array(await docxBytes(bundle))
        : input.format === "csv"
          ? csvText(bundle)
          : printHtml(bundle);
    const ext =
      input.format === "docx"
        ? "docx"
        : input.format === "csv"
          ? "csv"
          : "html";
    return new NextResponse(body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="bookforest.${ext}"; filename*=UTF-8''${encodeURIComponent(bundle.title)}.${ext}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error: /GOOGLE_NOT_CONFIGURED/.test(code)
          ? "Google 앱 설정이 필요합니다. Word·PDF 내보내기는 바로 사용할 수 있어요."
          : /GOOGLE_CONNECT_REQUIRED/.test(code)
            ? "Google 계정을 다시 연결해 주세요."
            : /GOOGLE_DRIVE/.test(code)
              ? "Google 파일을 만들지 못했어요. 연결 권한과 네트워크를 확인하고 다시 시도해 주세요."
              : /FORBIDDEN/.test(code)
                ? "선택한 기록을 내보낼 권한이 없습니다."
                : "내보내지 못했습니다. 선택한 기록과 연결 상태를 확인해 주세요.",
      },
      { status: /FORBIDDEN/.test(code) ? 403 : 400 },
    );
  }
}
