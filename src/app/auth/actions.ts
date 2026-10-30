"use server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { teacherEmail, teacherCallbackUrl } from "@/lib/account-access";
import { redirect } from "next/navigation";

export async function startTeacherGoogleLogin() {
  if (!isSupabaseConfigured() || process.env.GOOGLE_AUTH_ENABLED !== "true")
    return { ok: false, message: "Google 로그인 설정을 준비하고 있어요." };
  const callback = teacherCallbackUrl(process.env.NEXT_PUBLIC_APP_URL);
  const client = await createClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback,
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url)
    return {
      ok: false,
      message: "Google 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  const url = new URL(data.url);
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (
    !configured ||
    url.origin !== new URL(configured).origin ||
    url.pathname !== "/auth/v1/authorize"
  )
    return { ok: false, message: "Google 로그인 주소 설정을 확인해 주세요." };
  redirect(url.toString());
}

export async function sendTeacherLoginLink(form: FormData) {
  if (!isSupabaseConfigured())
    return { ok: false, message: "아직 계정 서비스 연결을 준비하고 있어요." };
  try {
    const email = teacherEmail.parse(String(form.get("email") ?? "").trim());
    const callback = teacherCallbackUrl(process.env.NEXT_PUBLIC_APP_URL);
    const client = await createClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: callback },
    });
    if (error)
      return {
        ok: false,
        message:
          error.status === 429
            ? "잠시 후 다시 요청해 주세요. 인증 메일은 연속해서 발송할 수 없어요."
            : "인증 메일을 보내지 못했어요. 운영자에게 이메일 발송 설정 확인을 요청해 주세요.",
      };
    return {
      ok: true,
      message:
        "인증 메일을 보냈어요. 지금 요청한 브라우저에서 메일의 로그인 링크를 열어 주세요. 스팸함도 확인해 주세요.",
    };
  } catch {
    return {
      ok: false,
      message: "선생님 이메일과 서비스 주소 설정을 확인해 주세요.",
    };
  }
}
