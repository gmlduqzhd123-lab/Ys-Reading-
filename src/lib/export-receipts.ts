import "server-only";
import { createClient } from "./supabase/server";
export async function recordExport(
  input: {
    kind: string;
    ids: string[];
    format: string;
    title: string;
    requestId: string;
  },
  url: string | null = null,
) {
  const c = await createClient();
  const r = await c.rpc("register_export_receipt", {
    p_kind: input.kind,
    p_ids: input.ids,
    p_format: input.format,
    p_title: input.title,
    p_url: url,
    p_request_id: input.requestId,
  });
  if (r.error) throw Error("EXPORT_RECEIPT_FAILED");
}
