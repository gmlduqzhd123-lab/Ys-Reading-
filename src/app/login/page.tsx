import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentProfile } from "@/lib/auth";
import { TeacherEmailLogin } from "@/components/teacher-email-login";
import { classroomAccountHref, classroomLoginDestination, classroomLoginHref } from "@/lib/classroom-entry";
import { accountEntry, loginDestination, loginEntry } from "@/lib/login-entry";
import { accountReady } from "@/lib/account-access";
export const metadata = { title: "내 교실 입장" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; mode?: string; intent?: string; next?: string }>;
}) {
  const { notice, mode, intent: requestedIntent, next: requestedPage } = await searchParams;
  const intent = requestedIntent === "classroom" ? "classroom" : undefined;
  const next = intent ? undefined : loginDestination(requestedPage);
  const teacher = mode === "teacher" || !!intent;
  const configured = isSupabaseConfigured();
  const profile = configured ? await getCurrentProfile() : null;
  if (profile) {
    if (!accountReady(profile)) redirect(intent ? classroomAccountHref : accountEntry(next));
    redirect(intent ? classroomLoginDestination(intent, profile.role) ?? classroomAccountHref : next ?? "/app");
  }
  return (
    <>
      <div className="login-layout">
        <div className="login-story">
          <span className="eyebrow">YOUR STORY BELONGS HERE</span>
          <h1>
            다시 만나 반가워요.
            <br />
            우리의 책숲에서.
          </h1>
          <p>
            어제보다 한 뼘 더 자랄
            <br />
            오늘의 이야기가 기다려요.
          </p>
          <Image className="paper-login-rabbit" src="/images/paper-rabbit.png" width={280} height={280} sizes="(max-width: 760px) 180px, 280px" alt="책을 읽는 토끼" />
        </div>
        <div className="login-form-wrap">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>{teacher ? "교사 로그인" : "학생 입장"}</h2>
          <nav className="login-choices" aria-label="로그인 종류">
            <Link href={loginEntry({ next })} prefetch={false} aria-current={!teacher ? "page" : undefined}>학생 입장</Link>
            <Link href={intent ? classroomLoginHref : loginEntry({ next, teacher: true })} prefetch={false} aria-current={teacher ? "page" : undefined}>교사 로그인</Link>
          </nav>
          {intent && <p>교사 로그인 후 학급 개설 화면으로 이동해요.</p>}
          {next && <p className="form-help">로그인 후 선택한 화면을 이어서 열어요.</p>}
          {notice === "password-changed" && <p role="status" className="notice">새 비밀번호로 다시 로그인해 주세요.</p>}
          {!configured && (
            <div className="notice">
              <strong>교실 연결을 준비하고 있어요.</strong>지금은 독서미션을
              둘러볼 수 있어요. 운영자가 데이터베이스 연결을 완료하면 로그인과
              글 저장을 사용할 수 있습니다.
            </div>
          )}
          {notice === "email-link" && (
            <p role="alert" className="notice">
              인증을 완료하지 못했어요. 같은 브라우저에서 로그인을 다시 시작해
              주세요. 이메일을 사용했다면 가장 최근 링크를 확인해 주세요.
            </p>
          )}
          {teacher ? (
            <>
              <TeacherEmailLogin configured={configured} googleEnabled={process.env.GOOGLE_AUTH_ENABLED === "true"} intent={intent} next={next} />
              <details className="login-password-option">
                <summary>이메일과 비밀번호로 로그인</summary>
                <LoginForm configured={configured} intent={intent} next={next} teacher />
              </details>
            </>
          ) : <LoginForm configured={configured} next={next} />}
        </div>
      </div>
    </>
  );
}
