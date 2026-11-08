"use server";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readingDraftCommand, readingDraftPayload } from "@/lib/reading-draft";
export async function readingDraftAction(input: unknown) {
  const v = readingDraftCommand.parse(input),
    p = await requireProfile();
  if(v.owner!==p.id)throw Error("BF_ACCOUNT_CHANGED");
  if (p.role !== "student" || p.consent_status !== "verified")
    throw Error("BF_FORBIDDEN");
  const c = await createClient();
  const r = await c.rpc("reading_draft", {
    p_action: v.action,
    p_classroom: v.classroom,
    p_record: v.record,
    p_payload: v.payload ?? {},
    p_revision: v.revision,
    p_request: v.request ?? null,
  });
  if (r.error)
    throw Error(
      r.error.message?.includes("BF_STALE_REVISION")
        ? "BF_STALE_REVISION"
        : "READING_DRAFT_UNAVAILABLE",
    );
  const data = r.data as {
    draft?: {
      payload: import("@/lib/reading-draft").ReadingDraftPayload;
      revision: number;
      updatedAt: string;
    } | null;
    revision?: number;
    updatedAt?: string;
  };
  if (data.draft)
    data.draft.payload = readingDraftPayload.parse(data.draft.payload);
  return data;
}
