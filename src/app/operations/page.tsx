import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OperationsPanel } from "@/components/operations-panel";
import type { OperationsState } from "@/lib/operations";
export const metadata = { title: "학생 계정·기록 관리" };
export default async function OperationsPage({ searchParams }: {
  searchParams: Promise<{ classroom?: string | string[] }>;
}) {
  const profile = await requireProfile();
  const client = await createClient();
  const { data, error } = await client.rpc("operations_state");
  if (error)
    throw new Error(
      "운영 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  if (profile.role !== "teacher" && !data.operator) redirect("/account");
  const requestedClass = (await searchParams).classroom;
  const initialClassId = (data as OperationsState).classes.find((c) => c.id === requestedClass)?.id;
  return (
    <OperationsPanel
      key={initialClassId ?? "default"}
      state={data as OperationsState}
      initialClassId={initialClassId}
      asOf={new Date().toISOString()}
    />
  );
}
