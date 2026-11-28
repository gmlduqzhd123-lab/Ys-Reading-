import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AccountPanel } from "@/components/account-panel";
import { PersonalDraftAccess } from "@/components/personal-draft";
import { accountReady } from "@/lib/account-access";
import { cookies } from "next/headers";
import { classroomLoginHref, teacherRequestCookie } from "@/lib/classroom-entry";
import { loginDestination, loginEntry } from "@/lib/login-entry";
export const metadata = { title: "계정·참여 관리" };
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ intent?: string; next?: string }> }) {
  const params = await searchParams;
  const setup = params.intent === "classroom";
  const next = setup ? undefined : loginDestination(params.next);
  const profile = await getCurrentProfile();
  if (!profile) redirect(setup ? classroomLoginHref : loginEntry({ next }));
  const client = await createClient();
  const { data } = profile.session_fresh
    ? await client.rpc("account_self_state")
    : { data: null };
  const requested = (await cookies()).get(teacherRequestCookie(profile.id))?.value === "1";
  return (
    <>
      <AccountPanel
        profile={profile}
        operator={Boolean(data?.operator)}
        deletions={data?.deletions ?? []}
        classroomSetup={setup || requested}
        teacherRequested={requested}
        returnTo={next}
        passwordRelogin={setup ? classroomLoginHref + "&notice=password-changed"
          : loginEntry({ next, teacher: profile.role === "teacher", notice: "password-changed" })}
      />
      {accountReady(profile) && (
        <section id="personal-draft-settings" className="panel">
          <h2>개인 기기 작성 보호</h2>
          <PersonalDraftAccess owner={profile.id} />
        </section>
      )}
    </>
  );
}
