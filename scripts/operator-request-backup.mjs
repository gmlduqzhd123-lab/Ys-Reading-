import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {defaultVault,ensureVault} from "./lib/operator-vault.mjs";
const directory=defaultVault();ensureVault(directory);
fs.writeFileSync(path.join(directory,"backup-request.json"),JSON.stringify({id:randomUUID(),requestedAt:new Date().toISOString()}),{mode:0o600});
const r=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command","Start-ScheduledTask -TaskName 'Bookforest-Operator-Backup' -TaskPath '\\Bookforest\\'"],{windowsHide:true,encoding:"utf8"});
console.log(JSON.stringify({requested:r.status===0}));process.exitCode=r.status===0?0:1;
