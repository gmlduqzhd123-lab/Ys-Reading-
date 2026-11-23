import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StartWizard } from "@/components/participation/start-wizard";
import type { Classroom } from "@/lib/data";
export const metadata = { title: "학급 개설·준비" };
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role !== "teacher") redirect("/hub?tab=today");
  const createNew = (await searchParams).mode === "new";
  const client = await createClient();
  const result = await client
    .from("classrooms")
    .select("*")
    .eq("teacher_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (result.error || !result.data)
    throw new Error("학급 준비 정보를 불러오지 못했습니다.");
  const origin = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3086",
  ).origin;
  return (
    <StartWizard
      key={createNew ? "new-class" : "resume"}
      createNew={createNew}
      userId={profile.id}
      data={{ classes: result.data as Classroom[] }}
      origin={origin}
    />
  );
}
