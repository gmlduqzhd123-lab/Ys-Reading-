import "server-only";
import { createClient } from "./supabase/server";
export async function exportJob(
  action: string,
  request: string,
  fingerprint: string,
  lease: string | null = null,
  result: unknown = null,
): Promise<{
  state?: string;
  lease?: string;
  result?: { id: string; webViewLink: string };
}> {
  const c = await createClient();
  const r = await c.rpc("google_export_job", {
    p_action: action,
    p_request: request,
    p_fingerprint: fingerprint,
    p_lease: lease,
    p_result: result,
  });
  if (r.error) {
    const known = [
      "GOOGLE_EXPORT_BUSY",
      "GOOGLE_EXPORT_PENDING",
      "BF_IDEMPOTENCY_CONFLICT",
    ].find((x) => r.error.message.includes(x));
    throw Error(known ?? "GOOGLE_EXPORT_JOB_FAILED");
  }
  return r.data;
}
