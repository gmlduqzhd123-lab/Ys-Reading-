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
}

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id,display_name,role,consent_status").eq("id", user.id).maybeSingle();
  if (profileError) throw new Error("계정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return profile as Profile | null;
});

export async function requireProfile(): Promise<Profile> {
  if (!isSupabaseConfigured()) redirect("/login?notice=setup");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?notice=account");
  return profile;
}
