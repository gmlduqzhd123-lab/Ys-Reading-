import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClassroomWorkshop } from "@/components/classroom/workshop";
import type { ClassroomToolState } from "@/lib/classroom-tools";
import { z } from "zod";
import { quizAiReady } from "@/lib/quiz-config";
export const metadata = { title: "수업 공방 · 매일 읽는 책숲" };
export default async function ClassroomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await requireProfile(),
    params = await searchParams,
    c = await createClient();
  const classes = await c
    .from("classrooms")
    .select("id,name")
    .order("created_at", { ascending: false })
    .limit(100);
  if (classes.error) throw Error("담당 학급을 읽지 못했어요.");
  const selected = params.classroom ?? classes.data?.[0]?.id;
  if (!selected)
    return (
      <main id="main-content" className="page-shell">
        <h1>우리 반 수업 공방</h1>
        <p>학급을 준비하면 독서 기록·활동지·도감이 연결됩니다.</p>
        <Link href="/start">우리 반 시작하기</Link>
      </main>
    );
  if (
    !z.uuid().safeParse(selected).success ||
    !classes.data?.some((x) => x.id === selected)
  )
    return (
      <main id="main-content" className="page-shell">
        <h1>학급을 확인해 주세요</h1>
        <Link href="/classroom">담당 학급으로 돌아가기</Link>
      </main>
    );
  const page = Math.max(1, Math.min(10000, Number(params.page) || 1)),
    query = (params.q ?? "").slice(0, 100),
    r = await c.rpc("classroom_tool_state", {
      p_classroom: selected,
      p_query: query,
      p_page: page,
    });
  if (r.error)
    throw Error("수업 공방에 연결하지 못했어요. 잠시 후 다시 열어 주세요.");
  return (
    <main id="main-content" className="page-shell">
      <ClassroomWorkshop
        key={selected + ":" + page + ":" + query}
        owner={p.id}
        student={p.role === "student"}
        state={r.data as ClassroomToolState}
        classes={classes.data ?? []}
        page={page}
        query={query}
        aiReady={quizAiReady()}
        initialStudent={
          z.uuid().safeParse(params.student).success
            ? params.student
            : undefined
        }
      />
    </main>
  );
}
