import "server-only";
import { requireProfile } from "./auth";
import { createClient } from "./supabase/server";
import type { ParticipationData } from "./participation";
export async function loadParticipation(): Promise<ParticipationData | null> {
  const profile = await requireProfile();
  if (profile.role === "student" && profile.consent_status !== "verified")
    return null;
  const client = await createClient();
  const { data, error } = await client.rpc("participation_state");
  if (error || !data) {
    console.warn("bookforest:participation-read", { code: error?.code ?? "empty" });
    throw new Error(
      "함께하는 책숲 정보를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  return data as ParticipationData;
}
