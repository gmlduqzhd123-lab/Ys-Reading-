import { redirect } from "next/navigation";
import { loadDashboard } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { StartWizard } from "@/components/participation/start-wizard";
import type { OperationsState } from "@/lib/operations";
export const metadata = { title: "우리 반 시작하기" };
export default async function StartPage() {
  const data = await loadDashboard();
  if (data.profile.role !== "teacher") redirect("/hub?tab=today");
  const client = await createClient();
  const result = await client.rpc("operations_state");
  if (result.error || !result.data)
    throw new Error("학급 준비 정보를 불러오지 못했습니다.");
  const origin = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3086",
  ).origin;
  return (
    <StartWizard
      data={data}
      state={result.data as OperationsState}
      origin={origin}
    />
  );
}
