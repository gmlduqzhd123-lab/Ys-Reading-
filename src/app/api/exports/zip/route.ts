import {NextRequest,NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {getCurrentProfile} from "@/lib/auth";
import {accountReady} from "@/lib/account-access";
import {createClient} from "@/lib/supabase/server";
import {zipStream} from "@/lib/zip-stream";
import {exportFailure} from "@/lib/export-status";
export const maxDuration=300;
function failure(code:string,status:number){return NextResponse.json({code,error:exportFailure(code)},{status,headers:{"Cache-Control":"no-store","X-Bookforest-Export-Code":code,...(status===429?{"Retry-After":"60"}:{})}});}
async function preflight(r:NextRequest,charge:boolean){
 const p=await getCurrentProfile(),parsed=z.uuid().safeParse(r.nextUrl.searchParams.get("batch"));
 if(!accountReady(p)||!parsed.success)return {error:failure("EXPORT_FORBIDDEN",401)};
 const c=await createClient(),id=parsed.data;
 const [status,check,usage]=await Promise.all([c.rpc("zip_job",{p_batch:id}),c.rpc("check_zip_download",{p_batch:id}),c.rpc("export_usage")]);
 if(status.error||check.error)return {error:failure(/BF_/.test(status.error?.message??check.error?.message??"")?"EXPORT_FORBIDDEN":"EXPORT_UNAVAILABLE",/BF_/.test(status.error?.message??check.error?.message??"")?403:503)};
 if(usage.error)return {error:failure("EXPORT_UNAVAILABLE",503)};
 if(status.data?.state!=="complete")return {error:failure("ZIP_NOT_READY",409)};
 if(usage.data.requestsThisMinute>=60)return {error:failure("EXPORT_RATE_LIMIT",429)};
 if(charge){const budget=await c.rpc("consume_export_budget");if(budget.error)return {error:failure("EXPORT_UNAVAILABLE",503)};if(budget.data!==true)return {error:failure("EXPORT_RATE_LIMIT",429)};}
 return {c,id,parts:Number(status.data.parts)};
}
export async function HEAD(r:NextRequest){const result=await preflight(r,false);if(result.error)return result.error;return new NextResponse(null,{headers:{"Cache-Control":"private, no-store","X-Bookforest-Export-Code":"READY"}});}
export async function GET(r:NextRequest){
 const result=await preflight(r,true);if(result.error)return result.error;const {c,id,parts}=result;
 async function* entries(){for(let n=0;n<parts;n++){
  const part=await c.rpc("read_zip_part",{p_batch:id,p_part:n});if(part.error||!part.data)throw Error("ZIP_ACCESS_CHANGED");
  const bytes=Buffer.from(part.data.content,"base64");if(createHash("sha256").update(bytes).digest("hex")!==part.data.digest)throw Error("ZIP_INTEGRITY_FAILED");
  yield {name:String(part.data.name),data:new Uint8Array(bytes)};
 }}
 return new NextResponse(zipStream(entries()),{headers:{"Content-Type":"application/zip","Content-Disposition":"attachment; filename=bookforest-records.zip; filename*=UTF-8''"+encodeURIComponent("책숲-기록묶음.zip"),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
