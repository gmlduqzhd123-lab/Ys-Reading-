import { redirect } from "next/navigation";
import { ForestScene } from "@/components/forest-scene";
import { LoginForm } from "@/components/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentProfile } from "@/lib/auth";
import { TeacherEmailLogin } from "@/components/teacher-email-login";
export const metadata = { title: "내 교실 입장" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const notice = (await searchParams).notice;
  const configured = isSupabaseConfigured();
  if (configured && (await getCurrentProfile())) redirect("/app");
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
          <ForestScene compact />
        </div>
        <div className="login-form-wrap">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>내 교실 입장</h2>
          <p>함께 읽고, 나의 생각을 펼쳐요.</p>
          {!configured && (
            <div className="notice">
              <strong>교실 연결을 준비하고 있어요.</strong>지금은 독서미션을
              둘러볼 수 있어요. 운영자가 데이터베이스 연결을 완료하면 로그인과
              글 저장을 사용할 수 있습니다.
            </div>
          )}
          <LoginForm configured={configured} />
          {notice === "email-link" && (
            <p role="alert" className="notice">
              인증을 완료하지 못했어요. 같은 브라우저에서 로그인을 다시 시작해
              주세요. 이메일을 사용했다면 가장 최근 링크를 확인해 주세요.
            </p>
          )}
          <TeacherEmailLogin
            configured={configured}
            googleEnabled={process.env.GOOGLE_AUTH_ENABLED === "true"}
          />
        </div>
      </div>
    </>
  );
}
