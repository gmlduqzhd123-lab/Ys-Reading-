import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { loadDashboard } from "@/lib/data";
import { WorkEditor } from "@/components/work-editor";
import { createClient } from "@/lib/supabase/server";
import { hubHref, withClassroom } from "@/lib/hub-navigation";
import { requireProfile } from "@/lib/auth";
import { pageDestination } from "@/lib/login-entry";
export const metadata = { title: "생각 쓰기" };
export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ historyPage?: string; classroom?: string; from?: string }>;
}) {
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  const sp = await searchParams;
  await requireProfile({ next: pageDestination("/app/work/" + id, sp) });
  const n = Number(sp.historyPage ?? 1);
  const data = await loadDashboard({
    assignment: id,
    page: Number.isSafeInteger(n) && n > 0 && n <= 1000000 ? n : 1,
  });
  if (data.profile.role !== "student") redirect("/app?view=feedback");
  const assignment = data.assignments.find((a) => a.id === id);
  if (!assignment) notFound();
  const classroom = sp.classroom === "" ? "" : assignment.classroom_id;
  const feedback = sp.from === "feedback";
  let choiceKey: string | undefined;
  if (
    assignment.choices?.length &&
    data.profile.consent_status === "verified"
  ) {
    const client = await createClient();
    const result = await client
      .from("mission_selections")
      .select("choice_key")
      .eq("assignment_id", id)
      .eq("student_id", data.profile.id)
      .maybeSingle();
    if (result.error)
      throw new Error("선택한 활동을 확인하지 못했습니다. 다시 시도해 주세요.");
    choiceKey = result.data?.choice_key;
  }
  return (
    <>
      <Link href={feedback ? withClassroom("/app?view=feedback", classroom) : hubHref("today", classroom)} className="back-link">
        <ArrowLeft size={16} />
        {feedback ? "받은 피드백으로 돌아가기" : "오늘 할 일로 돌아가기"}
      </Link>
      <WorkEditor data={data} assignment={assignment} choiceKey={choiceKey} />
    </>
  );
}
