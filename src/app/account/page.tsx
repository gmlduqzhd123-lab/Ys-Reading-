import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AccountPanel } from "@/components/account-panel";
import { PersonalDraftAccess } from "@/components/personal-draft";
import { accountReady } from "@/lib/account-access";
export const metadata = { title: "계정·참여 관리" };
export default async function AccountPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const client = await createClient();
  const { data } = profile.session_fresh
    ? await client.rpc("account_self_state")
    : { data: null };
  return (
    <>
      <AccountPanel
        profile={profile}
        operator={Boolean(data?.operator)}
        deletions={data?.deletions ?? []}
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
