import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { teacherCallbackUrl } from "@/lib/account-access";

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
  const failed = () =>
    NextResponse.redirect(new URL("/login?notice=email-link", origin), {
      status: 303,
      headers: noStore,
    });
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
  const { error: setupError } = await client.rpc(
    "complete_operator_email_setup",
  );
  if (setupError)
    return NextResponse.redirect(new URL("/account?notice=setup", origin), {
      status: 303,
      headers: noStore,
    });
  // The caller cannot choose a redirect or role through query parameters.
  return NextResponse.redirect(new URL("/account", origin), {
    status: 303,
    headers: noStore,
  });
}
