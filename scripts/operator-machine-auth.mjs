import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { nativeMcp } from "./lib/native-mcp.mjs";
import { defaultVault, vaultKey, projectRef } from "./lib/operator-vault.mjs";
import {
  openBackupAccess,
  machineTransport,
  machineFile,
  newMachineToken,
  machineTokenHash,
  saveMachine,
} from "./lib/backup-machine.mjs";
const directory = defaultVault();
let m;
try {
  const mode = process.argv[2] ?? "status";
  if (mode === "setup" && !fs.existsSync(path.join(directory, machineFile))) {
    m = await nativeMcp();
    if (
      (await m.call("get_project_url", {}))?.url !==
      `https://${projectRef}.supabase.co`
    )
      throw Error("PROJECT_SCOPE_MISMATCH");
    const exists = await m.call("execute_sql", {
      query:
        "select to_regprocedure('public.backup_machine_request(text,uuid,text,text,jsonb)') is not null ready",
    });
    if (!exists?.[0]?.ready) throw Error("BACKUP_MACHINE_SCHEMA_REQUIRED");
    const env = parseEnv(
      fs.readFileSync(
        path.resolve(import.meta.dirname, "../.env.local"),
        "utf8",
      ),
    );
    if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${projectRef}.supabase.co`)
      throw Error("PROJECT_SCOPE_MISMATCH");
    const credential = {
      projectRef,
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      apiKey:
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      id: randomUUID(),
      token: newMachineToken(),
      rotatedAt: new Date().toISOString(),
    };
    const hash = machineTokenHash(credential.token);
    await m.call("execute_sql", {
      query: `insert into private.backup_machine_credentials(id,label,token_hash) values('${credential.id}','Bookforest operator PC',decode('${hash}','hex'));`,
    });
    await machineTransport(credential).call("get_project_url");
    saveMachine(directory, vaultKey(directory, { create: false }), credential);
  }
  const client = await openBackupAccess({ rotate: mode === "rotate" });
  await client.call("get_project_url");
  client.close();
  console.log(
    JSON.stringify({
      authenticated: true,
      mode: "machine",
      projectRef,
      mcpRequired: false,
      automaticRotationDays: 30,
    }),
  );
} catch (e) {
  console.log(
    JSON.stringify({
      authenticated: false,
      code: /^[A-Z_]+$/.test(e.message)
        ? e.message
        : "MACHINE_AUTH_SETUP_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  m?.close();
}
