import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { googleStart } from "@/lib/google-drive";
export async function GET() {
  const p = await getCurrentProfile();
  if (!p || p.role !== "teacher")
    return NextResponse.json(
      { error: "교사 계정으로 로그인해 주세요." },
      { status: 403 },
    );
  try {
    return NextResponse.redirect(await googleStart(p.id));
  } catch {
    return NextResponse.json(
      {
        error:
          "Google 연결 설정이 준비되지 않았습니다. 운영자의 OAuth 앱 설정이 필요합니다.",
      },
      { status: 503 },
    );
  }
}
