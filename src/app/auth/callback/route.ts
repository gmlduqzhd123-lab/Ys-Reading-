import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { teacherCallbackUrl } from "@/lib/account-access";
import { classroomLoginCookie, classroomLoginDestination, classroomLoginHref } from "@/lib/classroom-entry";

export async function GET(request: NextRequest) {
  const noStore = { "Cache-Control": "private, no-store", Pragma: "no-cache" };
  let origin: string;
  try {
    origin = new URL(teacherCallbackUrl(process.env.NEXT_PUBLIC_APP_URL))
      .origin;
  } catch {
    return NextResponse.json(
      { error: "서비스 주소 설정을 확인해 주세요." },
      { status: 503, headers: noStore },
    );
  }
  const intent = request.cookies.get(classroomLoginCookie)?.value;
  const reply = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin), {
      status: 303,
      headers: noStore,
    });
    response.cookies.set(classroomLoginCookie, "", { path: "/auth/callback", maxAge: 0, httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:") });
    return response;
  };
  const failed = () => reply(intent === "classroom" ? classroomLoginHref + "&notice=email-link" : "/login?notice=email-link");
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 2048) return failed();
  const client = await createClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return failed();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return failed();
  const { data: setup, error: setupError } = await client.rpc(
    "complete_operator_email_setup",
  );
  if (setupError) return reply("/account?notice=setup");
  if (setup?.requiresMfa) return reply("/account/security?notice=operator-invitation");
  if (intent === "classroom") {
    const { data: profile } = await client.from("profiles")
      .select("role,account_active,must_change_password").eq("id", user.id).maybeSingle();
    if (profile?.account_active && !profile.must_change_password) {
      const destination = classroomLoginDestination(intent, profile.role);
      if (destination) return reply(destination);
    }
  }
  return reply("/account");
}
