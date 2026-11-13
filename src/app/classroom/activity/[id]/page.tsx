import Link from "next/link";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClassroomActivities } from "@/components/classroom/activities";
import type { ClassroomToolState } from "@/lib/classroom-tools";
export const metadata = { title: "배부 활동과 제출 원기록" };
export default async function ActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
  return (
    <div className="classroom-workshop">
      <Link href={"/classroom?classroom=" + state.classroom.id}>
        수업 공방으로
      </Link>
      <ClassroomActivities
        owner={profile.id}
        state={state}
        student={profile.role === "student"}
      />
    </div>
  );
}
