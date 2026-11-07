import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { decryptBackup, encryptBackup, projectRef } from "./operator-vault.mjs";
export function readAgent(directory, key) {
  const value = decryptBackup(fs.readFileSync(path.join(directory, "backup-agent.bfagent"), "utf8"), key);
  if (value.projectRef !== projectRef || value.url !== `https://${projectRef}.supabase.co` || !/^[a-f0-9]{64}$/.test(value.secret) || !value.apiKey || !Number.isSafeInteger(value.sequence)) throw Error("BACKUP_AGENT_INVALID");
  return value;
}
export function writeAgent(directory, key, value) {
  const file = path.join(directory, "backup-agent.bfagent");
  fs.writeFileSync(file + ".tmp", encryptBackup(value, key), { mode: 0o600 });
  fs.renameSync(file + ".tmp", file);
}
export async function reportAgent(directory, key, agent, state, code, phase) {
  // Persist before sending: crashes cannot reuse a sequence with different contents.
  agent.sequence++;
  writeAgent(directory, key, agent);
  const payload = JSON.stringify({ version: 1, agent: agent.id, sequence: agent.sequence, checkedAt: new Date().toISOString(), state, code, phase });
  const signature = createHmac("sha256", Buffer.from(agent.secret, "hex")).update(payload).digest("hex");
  const r = await fetch(agent.url + "/rest/v1/rpc/backup_agent_report", {
    method: "POST", headers: { apikey: agent.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_payload: payload, p_signature: signature }), signal: AbortSignal.timeout(12000),
  });
  if (!r.ok || (await r.json()).accepted !== true) throw Error("BACKUP_REPORT_UNAVAILABLE");
}
