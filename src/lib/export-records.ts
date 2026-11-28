import "server-only";
import type { Profile } from "./auth";
import { createClient } from "./supabase/server";

export async function readExportRecords<Row>(
  kind: "reading" | "writing" | "drafts",
  ids: string[],
  profile: Profile,
  classroom: string | undefined,
  columns = "*",
) {
  const client = await createClient();
  const table = kind === "reading" ? "reading_logs" : kind === "drafts" ? "drafts" : "submissions";
  const fields = classroom && kind !== "reading" ? `${columns},assignments!inner(classroom_id)` : columns;
  let query = client.from(table).select(fields).in("id", ids);
  if (classroom) query = query.eq(kind === "reading" ? "classroom_id" : "assignments.classroom_id", classroom);
  if (profile.role === "student") query = query.eq("student_id", profile.id);
  return query.overrideTypes<Row[], { merge: false }>();
}
