import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { accountReady } from "@/lib/account-access";
import { googleCallback, googleCancel } from "@/lib/google-drive";
import { appOrigin } from "@/lib/request-origin";
export async function GET(r: NextRequest) {
  const destination = (notice: string) => NextResponse.redirect(new URL(`/hub?tab=exports&google=${notice}`, appOrigin(r.url, r.headers.get("host"))));
  const p = await getCurrentProfile();
  if (!accountReady(p) || p.role !== "teacher")
    return NextResponse.json(
      { error: "연결을 시작한 교사 계정으로 다시 로그인해 주세요." },
      { status: 403 },
    );
  try {
    const code = r.nextUrl.searchParams.get("code"),
      state = r.nextUrl.searchParams.get("state");
    const denied = r.nextUrl.searchParams.get("error");
    if (denied) {
      await googleCancel(p.id, state ?? "");
      return destination(denied === "access_denied" ? "cancelled" : "failed");
    }
    if (!code || !state) throw new Error("GOOGLE_STATE_INVALID");
    await googleCallback(p.id, code, state);
    return NextResponse.redirect(
      new URL(
        "/hub?tab=exports&google=connected",
        appOrigin(r.url, r.headers.get("host")),
      ),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return destination(code === "GOOGLE_STATE_INVALID" ? "expired" : code === "GOOGLE_NOT_CONFIGURED" ? "configuration" : "failed");
  }
}
