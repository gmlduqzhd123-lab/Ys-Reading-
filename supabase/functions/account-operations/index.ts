import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  parseAccountInput,
  safePlan,
  runAccountJob,
  type Job,
} from "../_shared/account-worker.ts";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
// This endpoint validates the bearer user itself. It never accepts a claimed actor ID.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return new Response(null, { status: 405, headers });
  const authorization = req.headers.get("authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  try {
    const token = authorization.replace(/^Bearer\s+/i, "");
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);
    if (authError || !user)
      return reply({ ok: false, code: "BF_UNAUTHENTICATED" }, 401);
    const text = await req.text();
    if (text.length > 25000)
      return reply({ ok: false, code: "BF_INVALID_INPUT" }, 400);
    const input = parseAccountInput(JSON.parse(text));
    const secret = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = await crypto.subtle.sign(
      "HMAC",
      secret,
      new TextEncoder().encode(JSON.stringify(input)),
    );
    const fingerprint = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const { data: job, error } = await userClient.rpc("account_job_begin", {
      p_kind: input.kind,
      p_payload: safePlan(input),
      p_request_id: input.requestId,
      p_fingerprint: fingerprint,
    });
    if (error) return reply({ ok: false, code: safeError(error.message) }, 409);
    if (input.kind === "change_password" && !job.done) {
      if (!user.email) return reply({ ok: false, code: "BF_FORBIDDEN" }, 403);
      const verifier = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      let verified = await verifier.auth.signInWithPassword({
        email: user.email,
        password: input.currentPassword!,
      });
      // Reconcile a timeout after the previous password update actually succeeded.
      if (verified.error)
        verified = await verifier.auth.signInWithPassword({
          email: user.email,
          password: input.password!,
        });
      if (verified.error || verified.data.user?.id !== user.id) {
        await admin.rpc("account_job_finish", {
          p_id: job.id,
          p_lease: job.lease,
          p_index: 0,
          p_success: false,
        });
        return reply({ ok: false, code: "BF_PASSWORD_CURRENT" }, 403);
      }
      await verifier.auth.signOut();
    }
    const result = await runAccountJob(input, job as Job, {
      async create(id, email, password, jobId) {
        const found = await admin.auth.admin.getUserById(id);
        if (found.data.user) {
          if (
            found.data.user.email !== email ||
            found.data.user.app_metadata.bookforest_job !== jobId
          )
            throw new Error("BF_FORBIDDEN");
          return;
        }
        const { error } = await admin.auth.admin.createUser({
          id,
          email,
          password,
          email_confirm: true,
          app_metadata: { bookforest_job: jobId },
        });
        if (error) throw error;
      },
      async password(id, password) {
        const { error } = await admin.auth.admin.updateUserById(id, {
          password,
        });
        if (error) throw error;
      },
      async purge(id) {
        const { data, error } = await admin.rpc("operations_purge", {
          p_id: id,
        });
        if (error) throw error;
        return data;
      },
      async remove(id) {
        const found = await admin.auth.admin.getUserById(id);
        if (!found.data.user && found.error?.status === 404) return;
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw error;
      },
      async finish(job, index, success) {
        const { data, error } = await admin.rpc("account_job_finish", {
          p_id: job.id,
          p_lease: job.lease,
          p_index: index,
          p_success: success,
        });
        if (error) throw error;
        return data as Job;
      },
    });
    return reply(result, result.ok ? 200 : 503);
  } catch (error) {
    return reply(
      {
        ok: false,
        code: safeError(error instanceof Error ? error.message : ""),
      },
      400,
    );
  }
});
function safeError(value: string) {
  return (
    /BF_(INVALID_INPUT|PASSWORD_WEAK|PASSWORD_DIFFERENT|ACCOUNT_BLOCKED|IDEMPOTENCY_CONFLICT|BUSY|FORBIDDEN|NOT_FOUND|LOGIN_TAKEN)/.exec(
      value,
    )?.[0] ?? "BF_OPERATION_FAILED"
  );
}
