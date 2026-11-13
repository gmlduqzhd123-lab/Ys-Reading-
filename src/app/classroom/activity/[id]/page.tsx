import Link from "next/link";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClassroomActivities } from "@/components/classroom/activities";
import type { ClassroomToolState } from "@/lib/classroom-tools";
import { positivePage } from "@/lib/workshop-operations";
export const metadata = { title: "배부 활동과 제출 원기록" };
export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const profile = await requireProfile(),
    { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return (
      <div>
        <h1>활동을 확인해 주세요</h1>
      </div>
    );
  const c = await createClient(),
    r = await c.rpc("classroom_tool_activity", { p_activity: id });
  if (r.error || !r.data)
    return (
      <div className="page-shell">
        <h1>이 활동을 열 수 없어요</h1>
        <Link href="/classroom">담당 학급으로 돌아가기</Link>
      </div>
    );
  const state = r.data as ClassroomToolState;
  const search = await searchParams,
    page = positivePage(search.answerPage);
  const [activities, answers] = await Promise.all([
    c.rpc("classroom_workshop_query", {
      p_classroom: state.classroom.id,
      p_kind: "activities",
      p_page: 1,
      p_filters: { activity: id },
    }),
    c.rpc("classroom_workshop_query", {
      p_classroom: state.classroom.id,
      p_kind: "answers",
      p_page: page,
      p_filters: {
        activity: id,
        q: (search.answerQ ?? "").slice(0, 100),
        status: search.answerStatus ?? "all",
        student: search.answerStudent ?? "",
        from: search.answerFrom ?? "",
        until: search.answerUntil ?? "",
      },
    }),
  ]);
  if (activities.error || answers.error)
    throw Error("활동의 최신 상태를 확인하지 못했어요.");
  state.activities = activities.data.items;
  state.answers = answers.data.items;
  state.lists = { answers: { total: answers.data.total, page, size: 30 } };
  return (
    <div className="classroom-workshop">
      <Link href={"/classroom?classroom=" + state.classroom.id}>
        수업 공방으로
      </Link>
      <ClassroomActivities
        owner={profile.id}
        state={state}
        student={profile.role === "student"}
        params={search}
        basePath={"/classroom/activity/" + id}
      />
    </div>
  );
}
