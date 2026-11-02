import "server-only";
import { requireProfile } from "./auth";
import { createClient } from "./supabase/server";
import type { OperationsState } from "./operations";
import { z } from "zod";
export type OperationsFilters = {
  studentPage: number;
  consentPage: number;
  deletionPage: number;
  auditPage: number;
  q: string;
};
export function operationsFilters(
  params: Record<string, string | undefined>,
): OperationsFilters {
  const page = (s: string) => {
    const n = Number(params[s]);
    return Number.isSafeInteger(n) ? Math.min(100000, Math.max(1, n)) : 1;
  };
  return {
    studentPage: page("studentPage"),
    consentPage: page("consentPage"),
    deletionPage: page("deletionPage"),
    auditPage: page("auditPage"),
    q: (params.q ?? "").trim().slice(0, 80),
  };
}
export async function loadOperationsWorkspace(
  classroom?: string,
  params: Record<string, string | undefined> = {},
) {
  const p = await requireProfile();
  if (p.role !== "teacher") throw Error("선생님 계정에서 확인해 주세요.");
  const c = await createClient(),
    r = await c.rpc("operations_workspace", {
      p_classroom: z.uuid().safeParse(classroom).success ? classroom : null,
      p_filters: operationsFilters(params),
    });
  if (r.error || !r.data)
    throw Error("운영 명단을 읽지 못했어요. 담당 학급과 연결을 확인해 주세요.");
  return r.data as OperationsState;
}
