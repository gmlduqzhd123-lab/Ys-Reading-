import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {defaultVault} from "./operator-vault.mjs";
import {assessBackupTask} from "./backup-task-policy.mjs";
export function inspectBackupTask(role="backup") {
 if(process.platform!=="win32"||!["backup","watchdog"].includes(role))return {code:role==="watchdog"?"BACKUP_WATCHDOG_UNAVAILABLE":"BACKUP_TASK_CHECK_UNAVAILABLE",task:{inspectionFailed:true}};
 let installedAt;try{installedAt=JSON.parse(fs.readFileSync(path.join(defaultVault(),"watchdog-installation.json"),"utf8")).installedAt;}catch{}
 const r=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-File",path.resolve(import.meta.dirname,"../Inspect-Operator-Task.ps1"),"-TaskRole",role,"-Repo",path.resolve(import.meta.dirname,"../.."),"-NodePath",process.execPath],{windowsHide:true,encoding:"utf8",timeout:12000,maxBuffer:6000});
 let task;try{task=JSON.parse(r.stdout.trim());}catch{task={inspectionFailed:true};}
 if(r.status!==0)task={inspectionFailed:true};
 return {code:assessBackupTask(task,{role,installedAt}),task};
}
