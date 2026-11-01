import "server-only";
import { requireProfile } from "./auth";
import { createClient } from "./supabase/server";
import type {
  ClassOverview,
  SearchFilters,
  SearchResult,
} from "./classroom-insights";
export async function loadOverview(classroom: string, page = 1) {
  const p = await requireProfile();
  if (p.role !== "teacher") throw Error("선생님 계정에서 확인해 주세요.");
  const c = await createClient();
  const r = await c.rpc("teacher_overview", {
    p_classroom: classroom || null,
    p_page: page,
  });
  if (r.error)
    throw Error(
      "학급 현황을 읽지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
    );
  return r.data as ClassOverview;
}
export async function loadRecordSearch(f: SearchFilters) {
  await requireProfile();
  const c = await createClient();
  const r = await c.rpc("record_search", {
    p_kind: f.kind,
    p_classroom: f.classroom || null,
    p_student: f.student || null,
    p_query: f.q,
    p_from: f.from || null,
    p_to: f.to || null,
    p_status: f.status,
    p_page: f.page,
  });
  if (r.error)
    throw Error(
      "기록 검색을 마치지 못했어요. 검색 조건과 연결을 확인해 주세요.",
    );
  return r.data as SearchResult;
}
