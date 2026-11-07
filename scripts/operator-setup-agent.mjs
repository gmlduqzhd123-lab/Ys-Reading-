// One-time enrollment. Never print the dedicated HMAC key or SQL containing it.
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { randomBytes,randomUUID } from "node:crypto";
import { defaultVault,vaultKey,projectRef } from "./lib/operator-vault.mjs";
import { nativeMcp } from "./lib/native-mcp.mjs";
import { resolveBackupCodex } from "./lib/backup-runtime.mjs";
import { readAgent,writeAgent,reportAgent } from "./lib/backup-agent-channel.mjs";
import { acquireBackupLock } from "./lib/backup-lock.mjs";
let mcp,release;
try {
  const directory=defaultVault(),key=vaultKey(directory);
  release=acquireBackupLock(path.join(directory,"agent.lock"));
  process.env.BOOKFOREST_CODEX_BINARY=resolveBackupCodex();
  mcp=await nativeMcp();
  if((await mcp.call("get_project_url",{}))?.url !== `https://${projectRef}.supabase.co`) throw Error("PROJECT_SCOPE_MISMATCH");
  let agent;
  if(fs.existsSync(path.join(directory,"backup-agent.bfagent"))) agent=readAgent(directory,key);
  else {
    const env=parseEnv(fs.readFileSync(path.resolve(import.meta.dirname,"../.env.local"),"utf8"));
    const url=env.NEXT_PUBLIC_SUPABASE_URL,apiKey=env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    let role;
    try { role=JSON.parse(Buffer.from(apiKey.split(".")[1],"base64url").toString()).role; } catch {}
    if(url!==`https://${projectRef}.supabase.co` || !(apiKey?.startsWith("sb_publishable_") || role==="anon")) throw Error("PUBLIC_PROJECT_KEY_REQUIRED");
    agent={id:randomUUID(),secret:randomBytes(32).toString("hex"),sequence:0,url,apiKey,projectRef};
    await mcp.call("execute_sql",{query:`insert into private.backup_agents(id,secret) values('${agent.id}',decode('${agent.secret}','hex'))`});
    writeAgent(directory,key,agent);
  }
  await reportAgent(directory,key,agent,"ready","OK","probe");
  console.log(JSON.stringify({ok:true,enrolled:true,independentChannelVerified:true}));
} catch {console.error(JSON.stringify({ok:false,code:"BACKUP_AGENT_ENROLLMENT_FAILED"}));process.exitCode=1;}
finally {mcp?.close();release?.();}
