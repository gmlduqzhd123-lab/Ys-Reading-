import fs from "node:fs";
import path from "node:path";
import {parseEnv} from "node:util";
import {recoveryPreflight} from "./lib/recovery-preflight.mjs";
try{const name=process.argv[2];if(!name||!path.isAbsolute(name)||fs.lstatSync(name).isSymbolicLink())throw Error("TARGET_ENV_FILE_REQUIRED");
 const result=await recoveryPreflight(parseEnv(fs.readFileSync(name,"utf8")));console.log(JSON.stringify(result));if(!result.endpointsPassed)process.exitCode=1;
}catch(e){console.log(JSON.stringify({endpointsPassed:false,code:/^[A-Z_]+$/.test(e.message)?e.message:"PREFLIGHT_UNAVAILABLE",operationalCutoverVerified:false}));process.exitCode=1;}
