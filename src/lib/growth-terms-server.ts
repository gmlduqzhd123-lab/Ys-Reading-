import "server-only";
import { requireProfile } from "./auth";
import { createClient } from "./supabase/server";
import { z } from "zod";
import type { GrowthState, TermState } from "./growth-terms";
import type { HandoverState } from "@/components/hub/operations-batch";
export async function loadHandovers(): Promise<HandoverState> {
  const p = await requireProfile();
  if (p.role !== "teacher") throw Error("선생님 계정에서 확인해 주세요.");
  const c = await createClient(),
    r = await c.rpc("operations_scale_state");
  if (r.error || !r.data)
    throw Error("담임 인계 상태를 읽지 못했어요. 잠시 후 다시 시도해 주세요.");
  return r.data as HandoverState;
}
export async function loadGrowth(): Promise<GrowthState | null> {
  const p = await requireProfile();
  if (p.role === "student" && p.consent_status !== "verified") return null;
  const c = await createClient(),
    r = await c.rpc("growth_state");
  if (r.error || !r.data)
    throw Error("캐릭터 정보를 읽지 못했어요. 잠시 후 다시 시도해 주세요.");
  return r.data as GrowthState;
}
export async function loadTerms(
  classroom?: string,
  page = 1,
): Promise<TermState> {
  const profile = await requireProfile();
  const c = await createClient(),
    r = await c.rpc("term_state", {
      p_classroom: z.uuid().safeParse(classroom).success ? classroom : null,
    });
  if (r.error || !r.data)
    throw Error("학기 정보를 읽지 못했어요. 학급과 연결을 확인해 주세요.");
  const data = r.data as TermState;
  data.rosterPage = Math.max(1, Math.min(100000, Math.trunc(page) || 1));
  if (profile.role === "teacher" && data.selected && data.rosterPage > 1) {
    const roster = await c.rpc("term_roster_page", {
      p_classroom: data.selected,
      p_page: data.rosterPage,
    });
    if (roster.error)
      throw Error("학생 명단을 읽지 못했어요. 다시 시도해 주세요.");
    data.roster = roster.data ?? [];
  }
  return data;
}
