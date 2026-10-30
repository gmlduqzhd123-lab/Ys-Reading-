import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { googleDisconnect } from "@/lib/google-drive";
import { sameOrigin } from "@/lib/request-origin";
export async function POST(r: NextRequest) {
  if (!sameOrigin(r))
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 403 });
  const p = await getCurrentProfile();
  if (!p || p.role !== "teacher")
    return NextResponse.json(
      { error: "교사 로그인이 필요합니다." },
      { status: 403 },
    );
  await googleDisconnect();
  return NextResponse.json({ ok: true });
}
