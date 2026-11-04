import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { accountReady } from "@/lib/account-access";
import { googleDisconnect, googleRevoke } from "@/lib/google-drive";
import { sameOrigin } from "@/lib/request-origin";
export async function POST(r: NextRequest) {
  if (!sameOrigin(r))
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 403 });
  const p = await getCurrentProfile();
  if (!accountReady(p) || p.role !== "teacher")
    return NextResponse.json(
      { error: "교사 로그인이 필요합니다." },
      { status: 403 },
    );
  const input = await r.json().catch(() => ({}));
  if (input?.revoke === true) {
    try {
      await googleRevoke(p.id);
    } catch {
      return NextResponse.json(
        {
          error:
            "Google 권한 회수를 확인하지 못했어요. 다시 시도하거나 Google 계정의 연결된 앱에서 직접 해제해 주세요.",
        },
        { status: 503 },
      );
    }
  } else await googleDisconnect();
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
