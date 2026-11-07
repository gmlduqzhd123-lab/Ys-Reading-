import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { defaultVault, ensureVault, vaultKey, projectRef } from "./lib/operator-vault.mjs";
import { resolveBackupCodex } from "./lib/backup-runtime.mjs";
import { acquireBackupLock } from "./lib/backup-lock.mjs";
import { nativeMcp } from "./lib/native-mcp.mjs";
import { runBackupAgent } from "./lib/backup-agent.mjs";
import { readAgent, reportAgent } from "./lib/backup-agent-channel.mjs";
const directory = defaultVault(), stateFile = path.join(directory, "agent-state.json");
const read = (file) => { try { return JSON.parse(fs.readFileSync(file,"utf8")); } catch { return null; } };
let release;
try {
  ensureVault(directory);
  release = acquireBackupLock(path.join(directory, "agent.lock"));
  const key = vaultKey(directory), agent = readAgent(directory, key);
  const state = read(stateFile) || {};
  if (!state.lastVerifiedAt) {
    const proofs = fs.readdirSync(directory).filter(n => n.endsWith(".bfbak.verification.json")).sort().reverse();
    for (const name of proofs) {
      const proof = read(path.join(directory,name));
      if (proof?.verified === true && proof.projectRef === projectRef) {
        state.lastVerifiedAt = fs.statSync(path.join(directory,name)).mtime.toISOString(); break;
      }
    }
  }
  const result = await runBackupAgent({
    state, request: read(path.join(directory,"backup-request.json")),
    save: value => { fs.writeFileSync(stateFile + ".tmp",JSON.stringify(value),{mode:0o600}); fs.renameSync(stateFile + ".tmp",stateFile); },
    report: (status,code,phase) => reportAgent(directory,key,agent,status,code,phase),
    probe: async () => {
      process.env.BOOKFOREST_CODEX_BINARY = resolveBackupCodex();
      const mcp = await nativeMcp();
      try {
        const project = await mcp.call("get_project_url",{});
        if (project?.url !== `https://${projectRef}.supabase.co`) throw Error("PROJECT_SCOPE_MISMATCH");
      } finally { mcp.close(); }
    },
    backup: async () => {
      const r = spawnSync(process.execPath,[path.join(import.meta.dirname,"operator-backup.mjs")],{
        cwd:path.resolve(import.meta.dirname,".."),env:process.env,encoding:"utf8",windowsHide:true,maxBuffer:1024*1024,timeout:25*60*1000,
      });
      let value;
      try { value=JSON.parse(String(r.stdout || r.stderr).trim().split(/\r?\n/).at(-1)); } catch {}
      if(r.status !== 0 || value?.ok !== true || value.verified !== true) throw Error(value?.code || "BACKUP_RUN_FAILED");
      return {ok:true,verified:true};
    },
  });
  fs.writeFileSync(path.join(directory,"scheduled-status.json"),JSON.stringify({...result,checkedAt:new Date().toISOString(),state:state.state,code:state.code}),{mode:0o600});
  process.exitCode = result.ok === false ? 1 : 0;
} catch(e) {
  const code = /^[A-Z][A-Z_]{1,79}$/.test(e?.message ?? "") ? e.message : "BACKUP_RUNNER_UNAVAILABLE";
  fs.writeFileSync(path.join(directory,"scheduled-status.json"),JSON.stringify({ok:false,code,checkedAt:new Date().toISOString()}),{mode:0o600});
  process.exitCode = code === "BACKUP_ALREADY_RUNNING" ? 0 : 1;
} finally { release?.(); }
