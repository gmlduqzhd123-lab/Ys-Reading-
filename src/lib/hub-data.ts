import "server-only";
import { requireProfile, type Profile } from "./auth";
import { createClient } from "./supabase/server";
import type { Classroom, Submission, Draft } from "./data";
import type { Book } from "./hub";

export type HubRow = {
  id: string;
  classroom_id: string;
  student_id: string;
  created_at: string;
  [key: string]: unknown;
};
export type ReadingLog = HubRow & {
  book: Book;
  read_on: string;
  status: "reading" | "completed";
  thought: string;
  question: string;
  revision: number;
  verified_at: string | null;
};
export interface HubData {
  selectedClassroom?:string;
  availableClasses?:Classroom[];
  staffClasses?: import("./collaboration").StaffClass[];
  profile: Profile;
  classes: Classroom[];
  logs: ReadingLog[];
  posts: HubRow[];
  groups: { id: string; name: string; owner_id: string }[];
  members: HubRow[];
  items: HubRow[];
  orders: HubRow[];
  ledger: HubRow[];
  events: HubRow[];
  achievements: HubRow[];
  requests: HubRow[];
  invites: HubRow[];
  enrollments: HubRow[];
  students: Profile[];
  settings: HubRow[];
  character: { nickname: string; species: string } | null;
  submissions: Submission[];
  drafts: Draft[];
  totals: {
    xp: number;
    balances: Record<string, number>;
    studentBalances?: {
      studentId: string;
      classroomId: string;
      balance: number;
    }[];
  };
  schemaReady: boolean;
  truncated: string[];
  page: number;
  hasNext: boolean;
}
export async function loadHub(
  requestedPage = 1,
  activeTab = "reading",
  classroom = "",
): Promise<HubData> {
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(10000, Math.max(1, requestedPage))
    : 1;
  const pagedTables = new Set([
    "reading_logs",
    "plaza_posts",
    "shop_items",
    "shop_orders",
    "economy_ledger",
    "activity_events",
    "achievement_badges",
    "enrollment_requests",
    "submissions",
    "drafts",
  ]);
  const nextTables: Record<string, string[]> = {
    today: ["reading_logs"],
    review: ["reading_logs"],
    exhibitions: ["plaza_posts"],
    reading: ["reading_logs"],
    exports: ["reading_logs", "submissions", "drafts"],
    growth: ["activity_events", "achievement_badges"],
    plaza: ["plaza_posts"],
    economy: ["shop_items", "shop_orders", "economy_ledger"],
    manage: ["enrollment_requests"],
  };
  const activeTables = new Set(nextTables[activeTab] ?? nextTables.reading);
  const profile = await requireProfile();
  const needed: Record<string, string[]> = {
    reading: [
      "reading_logs",
      "profiles",
      ...(profile.role === "student" ? ["drafts", "submissions"] : []),
    ],
    exports: ["reading_logs", "submissions", "drafts", "profiles"],
    growth: [
      "character_profiles",
      "class_economy",
      "activity_events",
      "achievement_badges",
      "profiles",
    ],
    economy: [
      "shop_items",
      "shop_orders",
      "economy_ledger",
      "class_economy",
      "profiles",
      "enrollments",
    ],
    plaza: ["plaza_posts", "submissions", "grade_groups"],
    exhibitions: ["plaza_posts", "grade_groups"],
    manage: [
      "enrollment_requests",
      "class_invites",
      "enrollments",
      "profiles",
      "grade_groups",
      "grade_members",
    ],
    packs: [],
    terms: [],
  };
  const light = ["search", "overview", "today", "review"].includes(activeTab);
  const client = await createClient();
  const staff =
    profile.role === "teacher"
      ? await client.rpc("collaboration_state", {
          p_classroom: null,
          p_page: 1,
        })
      : null;
  if (staff?.error)
    throw Error("맡은 학급 권한을 읽지 못했어요. 다시 확인해 주세요.");
  const tables = [
    "classrooms",
    "reading_logs",
    "plaza_posts",
    "grade_groups",
    "grade_members",
    "shop_items",
    "shop_orders",
    "economy_ledger",
    "activity_events",
    "achievement_badges",
    "enrollment_requests",
    "class_invites",
    "enrollments",
    "profiles",
    "class_economy",
    "character_profiles",
    "submissions",
    "drafts",
  ] as const;
  const results = await Promise.all(
    tables.map(async (table) => {
      if (light && table !== "classrooms")
        return { table, data: [], error: null };
      if (
        table !== "classrooms" &&
        needed[activeTab] &&
        !needed[activeTab].includes(table)
      )
        return { table, data: [], error: null };
      const fields =
        table === "grade_groups" ? "id,name,owner_id,created_at" : classroom&&["drafts","submissions"].includes(table)?"*,assignments!inner(classroom_id)":"*";
      let query = client
        .from(table)
        .select(fields)
        .order("created_at", { ascending: false })
        .limit(pagedTables.has(table) ? 101 : 1001);
      if (pagedTables.has(table))
        query = query.order("id").range((page - 1) * 100, page * 100);
      if(classroom){
        if(["drafts","submissions"].includes(table))query=query.eq("assignments.classroom_id",classroom);
        else if(!["classrooms","profiles","grade_groups","character_profiles"].includes(table))query=query.eq("classroom_id",classroom);
      }
      if (table === "reading_logs" && activeTab === "review")
        query = query.eq("status", "completed").is("verified_at", null);
      const response = await query;
      return { table, ...response };
    }),
  );
  const missing = results.some(
    (r) => r.error && ["42P01", "PGRST205"].includes(r.error.code),
  );
  const other = results.find(
    (r) => r.error && !["42P01", "PGRST205"].includes(r.error.code),
  );
  if (other)
    throw new Error(
      "교실 기록을 읽지 못했습니다. 연결과 접근 권한을 확인해 주세요.",
    );
  const rows = (table: string) =>
    (results.find((r) => r.table === table)?.data ?? []).slice(
      0,
      pagedTables.has(table) ? 100 : 1000,
    ) as unknown as HubRow[];
  const summary = missing || light ? null : await client.rpc("hub_summary");
  if (summary?.error)
    throw new Error(
      "성장·지갑 합계를 불러오지 못했습니다. 새 데이터베이스 구성을 확인해 주세요.",
    );
  return {
    selectedClassroom:classroom,
    availableClasses:rows("classrooms") as unknown as Classroom[],
    staffClasses: staff?.data?.classes,
    profile,
    classes: (rows("classrooms") as unknown as Classroom[]).filter(c=>!classroom||c.id===classroom),
    logs: rows("reading_logs") as ReadingLog[],
    posts: rows("plaza_posts"),
    groups: rows("grade_groups") as unknown as HubData["groups"],
    members: rows("grade_members"),
    items: rows("shop_items"),
    orders: rows("shop_orders"),
    ledger: rows("economy_ledger"),
    events: rows("activity_events"),
    achievements: rows("achievement_badges"),
    requests: rows("enrollment_requests"),
    invites: rows("class_invites"),
    enrollments: rows("enrollments"),
    students: rows("profiles") as unknown as Profile[],
    settings: rows("class_economy"),
    character:
      (rows("character_profiles")[0] as unknown as HubData["character"]) ??
      null,
    submissions: rows("submissions") as unknown as Submission[],
    drafts: rows("drafts") as unknown as Draft[],
    totals: summary?.data ?? { xp: 0, balances: {} },
    schemaReady: !missing,
    page,
    hasNext: results.some(
      (r) => activeTables.has(r.table) && (r.data?.length ?? 0) > 100,
    ),
    truncated: results
      .filter((r) => !pagedTables.has(r.table) && (r.data?.length ?? 0) > 1000)
      .map((r) => r.table),
  };
}
