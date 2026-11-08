import type { NextConfig } from "next";
import {execFileSync} from "node:child_process";
let buildSha=process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||"",buildDirty=false;
if(!buildSha)try{buildSha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();buildDirty=!!execFileSync("git",["status","--porcelain"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
const config: NextConfig = {
  env:{BOOKFOREST_BUILD_SHA:/^[a-f0-9]{40}$/.test(buildSha)?buildSha:"",BOOKFOREST_BUILD_AT:new Date().toISOString(),BOOKFOREST_BUILD_DIRTY:String(buildDirty)},
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
    ] }];
  }
};
export default config;
