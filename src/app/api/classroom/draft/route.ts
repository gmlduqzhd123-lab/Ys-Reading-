import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/request-origin";
import { workshopDraftAction } from "@/app/classroom/workshop-actions";
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!sameOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403, headers });
  try {
    const raw = await request.text();
    if (raw.length > 3000) throw Error();
    const v = JSON.parse(raw);
    const result = await workshopDraftAction(v.owner, {
      action: "get",
      scope: v.scope,
      context: v.context,
    });
    return NextResponse.json(result, {
      status: result.ok ? 200 : result.code === "FORBIDDEN" ? 403 : 503,
      headers,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "RETRY",
        message: "초안을 확인하지 못했어요. 연결 후 다시 확인해 주세요.",
      },
      { status: 503, headers },
    );
  }
}
