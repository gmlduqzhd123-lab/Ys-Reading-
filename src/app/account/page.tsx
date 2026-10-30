import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AccountPanel } from "@/components/account-panel";
export const metadata = { title: "계정·참여 관리" };
export default async function AccountPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const client = await createClient();
  const { data } = profile.session_fresh
    ? await client.rpc("operations_state")
    : { data: null };
  return (
    <AccountPanel
      profile={profile}
      operator={Boolean(data?.operator)}
      deletions={data?.deletions ?? []}
    />
  );
}
