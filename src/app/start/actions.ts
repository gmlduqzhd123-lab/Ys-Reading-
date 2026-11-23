"use server";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClassOverview } from "@/lib/classroom-insights";
import { z } from "zod";
export async function startRoster(classroom: string) {
  const profile = await requireProfile();
  if (profile.role !== "teacher") throw Error("선생님 계정에서 확인해 주세요.");
  const id = z.uuid().parse(classroom);
  const c = await createClient();
  const [r, overview, assignments] = await Promise.all([
    c.rpc("start_roster_state", { p_classroom: id }),
    c.rpc("teacher_overview", { p_classroom: id, p_page: 1 }),
    c.from("assignments").select("id", { count: "exact", head: true }).eq("classroom_id", id),
  ]);
  if (r.error || !r.data)
    throw Error("학급 명단을 읽지 못했어요. 다시 시도해 주세요.");
  return {
    ...(r.data as { total: number; existing: string[] }),
    ready: overview.error ? null : (overview.data as ClassOverview | null)?.classes.find(c => c.id === id)?.ready ?? null,
    missions: assignments.error ? null : assignments.count,
  };
}
export type IssuanceList = {
  total: number;
  page: number;
  jobs: {
    request_id: string;
    created_at: string;
    done: boolean;
    lease_until: string;
    completed: number;
    students: { loginId: string; name: string; completed: boolean }[];
  }[];
};
export async function issuanceJobs(classroom: string, page = 1) {
  await requireProfile();
  const c = await createClient(),
    r = await c.rpc("issuance_jobs", {
      p_classroom: z.uuid().parse(classroom),
      p_page: z.number().int().min(1).max(100000).parse(page),
    });
  if (r.error || !r.data)
    throw Error("발급 작업을 읽지 못했어요. 담당 학급과 연결을 확인해 주세요.");
  return r.data as IssuanceList;
}
export async function checkRosterLogins(classroom: string, ids: string[]) {
  await requireProfile();
  const c = await createClient(),
    r = await c.rpc("check_roster_logins", {
      p_classroom: z.uuid().parse(classroom),
      p_logins: z
        .array(z.string().regex(/^[a-z0-9][a-z0-9_-]{3,31}$/))
        .min(1)
        .max(300)
        .parse(ids),
    });
  if (r.error)
    throw Error("아이디 중복을 확인하지 못했어요. 다시 시도해 주세요.");
  return r.data as string[];
}
