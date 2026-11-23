import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { accountReady } from "@/lib/account-access";
import { googleStart } from "@/lib/google-drive";
import { activeClassroom } from "@/lib/classroom-context-server";
import { hubHref } from "@/lib/hub-navigation";
import { appOrigin } from "@/lib/request-origin";
export async function GET(request: NextRequest) {
  const p = await getCurrentProfile();
  if (!accountReady(p) || p.role !== "teacher")
    return NextResponse.json(
      { error: "교사 계정으로 로그인해 주세요." },
      { status: 403 },
    );
  let classroom = "";
  const rawPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isSafeInteger(rawPage) && rawPage > 1 && rawPage <= 100000 ? rawPage : undefined;
  try {
    classroom = await activeClassroom(p.id, request.nextUrl.searchParams.get("classroom") ?? undefined);
    return NextResponse.redirect(await googleStart(p.id, classroom, page));
  } catch {
    return NextResponse.redirect(new URL(hubHref("exports", classroom, { google: "configuration", ...(page ? { page } : {}) }),
      appOrigin(request.url, request.headers.get("host"))));
  }
}
