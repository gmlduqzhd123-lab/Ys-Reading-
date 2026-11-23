import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { accountReady } from "@/lib/account-access";
import { googleCallback, googleCancel } from "@/lib/google-drive";
import { appOrigin } from "@/lib/request-origin";
import { withClassroom } from "@/lib/hub-navigation";
export async function GET(r: NextRequest) {
  const destination = (notice: string, classroom?: string) =>
    NextResponse.redirect(
      new URL(
        withClassroom(`/hub?tab=exports&google=${notice}`, classroom),
        appOrigin(r.url, r.headers.get("host")),
      ),
    );
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
      const classroom = await googleCancel(p.id, state ?? "");
      return destination(
        denied === "admin_policy_enforced" ||
          r.nextUrl.searchParams.get("error_subtype") ===
            "admin_policy_enforced"
          ? "school-policy"
          : denied === "access_denied"
            ? "cancelled"
            : "failed",
        classroom,
      );
    }
    if (!code || !state) throw new Error("GOOGLE_STATE_INVALID");
    const classroom = await googleCallback(p.id, code, state);
    return destination("connected", classroom);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return destination(
      code === "GOOGLE_STATE_INVALID"
        ? "expired"
        : code === "GOOGLE_NOT_CONFIGURED"
          ? "configuration"
          : "failed",
    );
  }
}
