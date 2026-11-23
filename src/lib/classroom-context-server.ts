import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function activeClassroom(owner: string, requested?: string) {
  const jar = await cookies();
  const value = requested ?? jar.get("bf_workspace_class_" + owner)?.value
    ?? jar.get("bf_class_" + owner)?.value;
  if (!value || !z.uuid().safeParse(value).success) return "";
  const client = await createClient();
  const { data, error } = await client.from("classrooms").select("id").eq("id", value).maybeSingle();
  if (error) throw Error("학급 연결을 확인하지 못했어요. 다시 열어 주세요.");
  return data?.id ?? "";
}
