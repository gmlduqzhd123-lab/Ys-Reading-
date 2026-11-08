import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { nativeMcp } from "./lib/native-mcp.mjs";
import { resolveBackupCodex } from "./lib/backup-runtime.mjs";
import { projectRef } from "./lib/operator-vault.mjs";
let mcp;
try {
  const file = path.resolve(import.meta.dirname, "../.env.local"),
    raw = fs.readFileSync(file, "utf8"),
    env = parseEnv(raw),
    secret = env.BOOKFOREST_LIMITER_SECRET || randomBytes(32).toString("hex");
  if (!/^[a-f0-9]{64}$/.test(secret)) throw Error("BUDGET_KEY_INVALID");
  process.env.BOOKFOREST_CODEX_BINARY = resolveBackupCodex();
  mcp = await nativeMcp();
  if (
    (await mcp.call("get_project_url", {}))?.url !==
    `https://${projectRef}.supabase.co`
  )
    throw Error("PROJECT_SCOPE_MISMATCH");
  await mcp.call("execute_sql", {
    query: `insert into private.api_request_keys values(true,decode('${secret}','hex')) on conflict do nothing;`,
  });
  const rows = await mcp.call("execute_sql", {
    query: `select secret=decode('${secret}','hex') as matches from private.api_request_keys where id`,
  });
  if (rows?.[0]?.matches !== true) throw Error("BUDGET_KEY_MISMATCH");
  if (!env.BOOKFOREST_LIMITER_SECRET)
    fs.appendFileSync(file, "\nBOOKFOREST_LIMITER_SECRET=" + secret + "\n", {
      mode: 0o600,
    });
  console.log(JSON.stringify({ enrolled: true, secretPrinted: false }));
} catch {
  console.error(
    JSON.stringify({ enrolled: false, code: "BUDGET_ENROLLMENT_FAILED" }),
  );
  process.exitCode = 1;
} finally {
  mcp?.close();
}
