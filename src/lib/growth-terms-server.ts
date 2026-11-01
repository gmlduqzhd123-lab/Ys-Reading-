import "server-only";
import { requireProfile } from "./auth";
import { createClient } from "./supabase/server";
import { z } from "zod";
import type { GrowthState, TermState } from "./growth-terms";
export async function loadGrowth(): Promise<GrowthState | null> {
  const p = await requireProfile();
  if (p.role === "student" && p.consent_status !== "verified") return null;
  const c = await createClient(),
    r = await c.rpc("growth_state");
  if (r.error || !r.data)
    throw Error("캐릭터 정보를 읽지 못했어요. 잠시 후 다시 시도해 주세요.");
  return r.data as GrowthState;
}
export async function loadTerms(classroom?: string): Promise<TermState> {
  await requireProfile();
  const c = await createClient(),
    r = await c.rpc("term_state", {
      p_classroom: z.uuid().safeParse(classroom).success ? classroom : null,
    });
  if (r.error || !r.data)
    throw Error("학기 정보를 읽지 못했어요. 학급과 연결을 확인해 주세요.");
  return r.data as TermState;
}
