import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { accountReady } from "@/lib/account-access";
import { googleCallback } from "@/lib/google-drive";
import { appOrigin } from "@/lib/request-origin";
export async function GET(r: NextRequest) {
  const p = await getCurrentProfile();
  if (!accountReady(p) || p.role !== "teacher")
    return NextResponse.json(
      { error: "연결을 시작한 교사 계정으로 다시 로그인해 주세요." },
      { status: 403 },
    );
  try {
    const code = r.nextUrl.searchParams.get("code"),
      state = r.nextUrl.searchParams.get("state");
    if (!code || !state) throw new Error("AUTH_CANCELLED");
    await googleCallback(p.id, code, state);
    return NextResponse.redirect(
      new URL(
        "/hub?tab=exports&google=connected",
        appOrigin(r.url, r.headers.get("host")),
      ),
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Google 연결을 완료하지 못했습니다. 책숲 내보내기 화면에서 연결을 다시 시작해 주세요.",
      },
      { status: 400 },
    );
  }
}
