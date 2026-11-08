import { createClient } from "@supabase/supabase-js";
import { encryptCloud } from "../_shared/cloud-crypto.mjs";
import { readCloudJob } from "../_shared/cloud-request.mjs";
declare const Deno: {
  env: { get(k: string): string | undefined };
  serve(handler: (r: Request) => Promise<Response>): void;
};
// Authentication is a one-use, expiring 128-bit capability created by private
// cron SQL. Only service_role can claim it; no snapshot is returned to callers.
Deno.serve(async (r) => {
  const reply = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  let id: string;
  try {
    id = await readCloudJob(r);
  } catch {
    return reply(400, { code: "INVALID_REQUEST" });
  }
  const url = Deno.env.get("SUPABASE_URL")!,
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const claimed = await client.rpc("claim_cloud_backup_job", { p_job: id });
  if (claimed.error || !claimed.data)
    return reply(403, { code: "JOB_UNAVAILABLE" });
  try {
    const bucket = client.storage.from("bookforest-backups"),
      data = claimed.data;
    if (data.purpose === "download") {
      if (
        typeof data.path !== "string" ||
        !/^[-a-f0-9]{36}\.bfcloud$/.test(data.path)
      )
        throw Error();
      const file = await bucket.download(data.path);
      if (file.error || !file.data) throw Error();
      return new Response(await file.data.text(), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, no-store",
        },
      });
    }
    const encrypted = JSON.stringify(
        await encryptCloud(
          { snapshot: data.snapshot, privacy: data.privacy },
          data.publicKey,
        ),
      ),
      path = id + ".bfcloud",
      bytes = new TextEncoder().encode(encrypted);
    if (bytes.length > 32000000) throw Error();
    const upload = await bucket.upload(path, bytes, {
      contentType: "application/json",
      upsert: false,
    });
    if (upload.error) throw Error();
    const readback = await bucket.download(path);
    if (readback.error || (await readback.data?.text()) !== encrypted)
      throw Error();
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
    const done = await client.rpc("finish_cloud_backup_job", {
      p_job: id,
      p_path: path,
      p_bytes: bytes.length,
      p_digest: hash,
      p_ok: true,
    });
    if (done.error) throw Error();
    const prune = await client.rpc("cloud_archive_prune", { p_commit: false });
    if (!prune.error && Array.isArray(prune.data) && prune.data.length) {
      const removed = await bucket.remove(prune.data);
      if (!removed.error)
        await client.rpc("cloud_archive_prune", { p_commit: true });
    }
    return reply(200, { code: "ENCRYPTED_ARCHIVE_STORED" });
  } catch {
    await client.rpc("finish_cloud_backup_job", {
      p_job: id,
      p_path: null,
      p_bytes: null,
      p_digest: null,
      p_ok: false,
    });
    return reply(503, { code: "CLOUD_BACKUP_FAILED" });
  }
});
