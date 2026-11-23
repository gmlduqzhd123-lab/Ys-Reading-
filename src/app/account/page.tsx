import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AccountPanel } from "@/components/account-panel";
import { PersonalDraftAccess } from "@/components/personal-draft";
import { accountReady } from "@/lib/account-access";
import { cookies } from "next/headers";
import { teacherRequestCookie } from "@/lib/classroom-entry";
export const metadata = { title: "계정·참여 관리" };
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const client = await createClient();
  const { data } = profile.session_fresh
    ? await client.rpc("account_self_state")
    : { data: null };
  const setup = (await searchParams).intent === "classroom";
  const requested = (await cookies()).get(teacherRequestCookie(profile.id))?.value === "1";
  return (
    <>
      <AccountPanel
        profile={profile}
        operator={Boolean(data?.operator)}
        deletions={data?.deletions ?? []}
        classroomSetup={setup || requested}
        teacherRequested={requested}
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
