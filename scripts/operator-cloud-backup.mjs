import fs from "node:fs";
import path from "node:path";
import { nativeMcp } from "./lib/native-mcp.mjs";
import {
  defaultVault,
  vaultKey,
  projectRef,
  encryptBackup,
} from "./lib/operator-vault.mjs";
import { cloudKey } from "./lib/cloud-key.mjs";
import { decryptCloud } from "../supabase/functions/_shared/cloud-crypto.mjs";
import { prepareBackup, verifyRestore } from "./lib/operator-restore.mjs";
import { registrationDecision } from "./lib/cloud-registration.mjs";
const directory = defaultVault();
let m;
try {
  const key=vaultKey(directory,{create:false}),derived=cloudKey(key);
  m=await nativeMcp();
  if (
    (await m.call("get_project_url", {}))?.url !==
    `https://${projectRef}.supabase.co`
  )
    throw Error("PROJECT_SCOPE_MISMATCH");
  if (process.argv.includes("setup")) {
    const config = await m.call("execute_sql", {query:"select public_key from private.cloud_backup_config where singleton"});
    registrationDecision(config[0]?.public_key, derived.publicKey);
    const saved=await m.call("execute_sql", {
      query: `insert into private.cloud_backup_config(singleton,public_key) values(true,'${derived.publicKey}') on conflict(singleton) do update set enabled=true where cloud_backup_config.public_key=excluded.public_key returning singleton;`,
    });
    if(saved.length!==1)throw Error("RECOVERY_KEY_CHANGED_RETRY");
    console.log(
      JSON.stringify({ ok: true, configured: true, privateKeyExported: false }),
    );
  } else {
    const rows = await m.call("execute_sql", {
      query:
        "select id,digest,verified_at from private.cloud_backup_jobs where purpose='backup' and status='stored' order by created_at desc limit 1",
    });
    const latest = rows?.[0];
    if (!latest) throw Error("CLOUD_BACKUP_MISSING");
    if (latest.verified_at && !process.argv.includes("--force")) {
      console.log(JSON.stringify({ ok: true, skipped: true }));
    } else {
      const jobs = await m.call("execute_sql", {
        query: `insert into private.cloud_backup_jobs(purpose,source_id) values('download','${latest.id}') returning id;`,
      });
      const response = await fetch(
        `https://${projectRef}.supabase.co/functions/v1/cloud-backup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job: jobs[0].id }),
          signal: AbortSignal.timeout(120000),
        },
      );
      if (!response.ok) throw Error("CLOUD_DOWNLOAD_FAILED");
      const raw = await response.text();
      const { createHash } = await import("node:crypto");
      if (createHash("sha256").update(raw).digest("hex") !== latest.digest)
        throw Error("CLOUD_DIGEST_MISMATCH");
      const value = await decryptCloud(raw, derived.privateJwk),
        repo = path.resolve(import.meta.dirname, ".."),
        files = fs
          .readdirSync(path.join(repo, "supabase/migrations"))
          .filter((n) => n.endsWith(".sql"))
          .map((name) => ({
            name,
            sql: fs.readFileSync(
              path.join(repo, "supabase/migrations", name),
              "utf8",
            ),
          }));
      const backup = prepareBackup(value.snapshot, files),
        guard = (
          await m.call("execute_sql", {
            query: "select private.operator_privacy_checkpoint() checkpoint",
          })
        )[0].checkpoint;
      const proof = await verifyRestore(backup, {
        projectRef,
        checkpoint: guard,
      });
      if (!proof.verified) throw Error("CLOUD_RESTORE_FAILED");
      fs.writeFileSync(path.join(directory, latest.id + ".bfcloud"), raw, {
        mode: 0o600,
      });
      fs.writeFileSync(
        path.join(directory, latest.id + ".cloud.bfbak"),
        encryptBackup(backup, key),
        { mode: 0o600 },
      );
      fs.writeFileSync(
        path.join(directory, "cloud-status.json"),
        JSON.stringify({
          ...proof,
          job: latest.id,
          cipherDigest:latest.digest,
          checkedAt: new Date().toISOString(),
        }),
        { mode: 0o600 },
      );
      await m.call("execute_sql", {
        query: `update private.cloud_backup_jobs set verified_at=now() where id='${latest.id}' and digest='${latest.digest}';`,
      });
      console.log(
        JSON.stringify({
          ok: true,
          verified: true,
          tables: proof.tables,
          rows: proof.rows,
          operationalCutoverVerified: false,
        }),
      );
    }
  }
} catch (e) {
  console.log(
    JSON.stringify({
      ok: false,
      code: /^[A-Z_]+$/.test(e.message)
        ? e.message
        : "CLOUD_VERIFICATION_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  m?.close();
}
