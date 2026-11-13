import "server-only";
import { z } from "zod";
import { createClient } from "./supabase/server";
import { positivePage, workshopSection } from "./workshop-operations";
import type { ClassroomToolState } from "./classroom-tools";
export async function loadWorkshopLists(
  c: Awaited<ReturnType<typeof createClient>>,
  state: ClassroomToolState,
  params: Record<string, string | undefined>,
  student: boolean,
) {
  const section = workshopSection(params.section),
    all = section === "all";
  const filters = (prefix: string) => ({
    q: (
      params[prefix + "Q"] ??
      (prefix === "book" ? params.q : "") ??
      ""
    ).slice(0, 100),
    status: params[prefix + "Status"] ?? "all",
    student: z.uuid().safeParse(params[prefix + "Student"]).success
      ? params[prefix + "Student"]
      : "",
    from: z.iso.date().safeParse(params[prefix + "From"]).success
      ? params[prefix + "From"]
      : "",
    until: z.iso.date().safeParse(params[prefix + "Until"]).success
      ? params[prefix + "Until"]
      : "",
  });
  const get = async (kind: string, prefix: string) => {
    const r = await c.rpc("classroom_workshop_query", {
      p_classroom: state.classroom.id,
      p_kind: kind,
      p_page: positivePage(params[prefix + "Page"]),
      p_filters: filters(prefix),
    });
    if (r.error)
      throw Error(
        "수업 목록을 불러오지 못했어요. 검색 기간과 학급 권한을 확인해 주세요.",
      );
    return r.data;
  };
  const requests = [
    [
      all ||
        section === "activities" ||
        section === "settings" ||
        (student && section === "today"),
      "activities",
      "activity",
    ],
    [!student && (all || section === "activities"), "answers", "answer"],
    [
      state.classroom.owner && (all || section === "maker"),
      "templates",
      "template",
    ],
    [all || section === "library", "library", "book"],
    [state.classroom.owner && (all || section === "family"), "shares", "share"],
    [
      state.classroom.owner && (all || section === "family"),
      "reports",
      "report",
    ],
  ] as const;
  const results = await Promise.all(
    requests.map(
      async ([needed, kind, prefix]) =>
        [kind, needed ? await get(kind, prefix) : null] as const,
    ),
  );
  const result = {
    ...state,
    lists: {},
    activities: [],
    answers: [],
    templates: [],
    library: [],
    shares: [],
    reports: [],
  } as ClassroomToolState;
  for (const [k, data] of results)
    if (data) {
      (result as unknown as Record<string, unknown>)[k] = data.items;
      result.lists![k] = {
        total: data.total,
        page: data.page,
        size: data.size,
      };
      if (k === "activities") result.activityTotal = data.total;
      if (k === "library") result.libraryTotal = data.total;
    }
  if (student && result.activities.length) {
    const r = await c.rpc("classroom_workshop_query", {
      p_classroom: state.classroom.id,
      p_kind: "answers",
      p_page: 1,
      p_filters: { activities: result.activities.map((a) => a.id) },
    });
    if (r.error) throw Error("나의 제출 버전을 확인하지 못했어요.");
    result.answers = r.data.items;
  }
  return result;
}
