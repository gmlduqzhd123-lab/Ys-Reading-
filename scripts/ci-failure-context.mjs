// DOM snapshots from this isolated synthetic fixture only. No production traces,
// cookies, headers, environment variables or authentication payloads are read.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {redactBrowserContext} from './lib/ci-context.mjs';
if(process.env.GITHUB_ACTIONS!=="true"||process.env.BOOKFOREST_E2E!=="1"||!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??""))throw Error("ISOLATED_CI_ONLY");
function walk(directory){if(!fs.existsSync(directory))return;for(const e of fs.readdirSync(directory,{withFileTypes:true})){if(e.isSymbolicLink())continue;const file=path.join(directory,e.name);if(e.isDirectory())walk(file);else if(e.name==="error-context.md"){console.log("Synthetic browser DOM context:");console.log(redactBrowserContext(fs.readFileSync(file,"utf8")).slice(0,18000));}}}walk("test-results");
// Only states and counts. Never print task capabilities, JWT claims or bundles.
const diagnostic=`select jsonb_build_object('zipJobs',(select jsonb_agg(x) from(select state,error_code,count(*) n from private.zip_jobs group by state,error_code)x),'zipTasks',(select jsonb_agg(x) from(select state,count(*) n from private.zip_tasks group by state)x),'pgNetEnabled',to_regnamespace('net') is not null)`;
try{console.log(execFileSync('docker',['exec','-i','supabase_db_bookforest','psql','-U','postgres','-d','postgres','-Atq','-c',diagnostic],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim());}catch{console.log('Synthetic ZIP diagnostics unavailable.');}
