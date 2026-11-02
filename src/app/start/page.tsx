import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StartWizard } from "@/components/participation/start-wizard";
import type { OperationsState } from "@/lib/operations";
import type { Classroom } from "@/lib/data";
export const metadata = { title: "우리 반 시작하기" };
export default async function StartPage() {
  const profile = await requireProfile();
  if (profile.role !== "teacher") redirect("/hub?tab=today");
  const client = await createClient();
  const result = await client
    .from("classrooms")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (result.error || !result.data)
    throw new Error("학급 준비 정보를 불러오지 못했습니다.");
  const origin = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3086",
  ).origin;
  return (
    <StartWizard
      data={{ classes: result.data as Classroom[] }}
      origin={origin}
    />
  );
}
