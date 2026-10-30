import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface Profile {
  id: string;
  display_name: string;
  role: "student" | "teacher";
  consent_status: "pending" | "verified";
  created_at?: string;
  account_active?: boolean;
  must_change_password?: boolean;
  session_fresh?: boolean;
}

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id,display_name,role,consent_status,account_active,must_change_password",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (profileError)
    throw new Error(
      "계정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  if (!profile) return null;
  const { data: session, error: sessionError } =
    await supabase.rpc("account_session");
  if (sessionError)
    throw new Error("로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.");
  return { ...profile, session_fresh: session?.fresh === true } as Profile;
});

export async function requireProfile(): Promise<Profile> {
  if (!isSupabaseConfigured()) redirect("/login?notice=setup");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?notice=account");
  if (
    profile.account_active === false ||
    profile.must_change_password ||
    profile.session_fresh === false
  )
    redirect("/account");
  return profile;
}
