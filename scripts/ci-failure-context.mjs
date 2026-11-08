// DOM snapshots from this isolated synthetic fixture only. No production traces,
// cookies, headers, environment variables or authentication payloads are read.
import fs from "node:fs";
import path from "node:path";
if(process.env.GITHUB_ACTIONS!=="true"||process.env.BOOKFOREST_E2E!=="1"||!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??""))throw Error("ISOLATED_CI_ONLY");
function walk(directory){if(!fs.existsSync(directory))return;for(const e of fs.readdirSync(directory,{withFileTypes:true})){if(e.isSymbolicLink())continue;const file=path.join(directory,e.name);if(e.isDirectory())walk(file);else if(e.name==="error-context.md"){console.log("Synthetic browser DOM context:");console.log(fs.readFileSync(file,"utf8").slice(0,18000));}}}walk("test-results");
