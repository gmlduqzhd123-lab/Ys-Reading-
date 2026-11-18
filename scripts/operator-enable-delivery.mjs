import fs from "node:fs";
import path from "node:path";
import { defaultVault, projectRef } from "./lib/operator-vault.mjs";
import { operatorTransport } from "./lib/operator-transport.mjs";
let m;
try {
  m = await operatorTransport();
  if (
    (await m.call("get_project_url", {}))?.url !==
    `https://${projectRef}.supabase.co`
  )
    throw Error("PROJECT_SCOPE_MISMATCH");
  const rows = await m.call("execute_sql", {
    query:
      "select to_regprocedure('public.delivery_agent_report(text,text)') is not null as ready",
  });
  if (rows?.[0]?.ready !== true) throw Error("DELIVERY_SCHEMA_NOT_READY");
  fs.writeFileSync(
    path.join(defaultVault(), "delivery-monitor-enabled.json"),
    JSON.stringify({ version: 1, enabledAt: new Date().toISOString() }),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ enabled: true }));
} catch (e) {
  console.log(
    JSON.stringify({
      enabled: false,
      code:
        e?.message === "DELIVERY_SCHEMA_NOT_READY"
          ? e.message
          : "DELIVERY_SETUP_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  m?.close();
}
