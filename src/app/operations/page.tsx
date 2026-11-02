import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OperationsPanel } from "@/components/operations-panel";
import type { OperationsState } from "@/lib/operations";
import { loadHandovers } from "@/lib/growth-terms-server";
import { loadOperationsWorkspace } from "@/lib/operations-workspace";
export const metadata = { title: "학생 계정·기록 관리" };
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const profile = await requireProfile();
  if (profile.role !== "teacher") redirect("/account");
  const params = await searchParams;
  const data = await loadOperationsWorkspace(params.classroom, params);
  const initialClassId = data.selected ?? undefined;
  const handovers = profile.role === "teacher" ? await loadHandovers() : null;
  return (
    <OperationsPanel
      key={JSON.stringify([initialClassId, data.pages])}
      state={data as OperationsState}
      initialClassId={initialClassId}
      asOf={new Date().toISOString()}
      handovers={handovers}
    />
  );
}
