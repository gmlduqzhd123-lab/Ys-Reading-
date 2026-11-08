import {NextRequest,NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {getCurrentProfile} from "@/lib/auth";
import {accountReady} from "@/lib/account-access";
import {createClient} from "@/lib/supabase/server";
import {zipStream} from "@/lib/zip-stream";
export const maxDuration=300;
export async function GET(r:NextRequest){
 const p=await getCurrentProfile(),parsed=z.uuid().safeParse(r.nextUrl.searchParams.get("batch"));
 if(!accountReady(p)||!parsed.success)return NextResponse.json({error:"현재 이용 가능한 계정과 묶음을 확인해 주세요."},{status:401});
 const c=await createClient();
 const [status,check,budget]=await Promise.all([c.rpc("zip_job",{p_batch:parsed.data}),c.rpc("check_zip_download",{p_batch:parsed.data}),c.rpc("consume_export_budget")]);
 if(status.error||status.data?.state!=="complete"||check.error||budget.error||budget.data!==true)return NextResponse.json({error:"ZIP 준비 상태·현재 권한·요청 한도를 확인해 주세요."},{status:403,headers:{"Cache-Control":"no-store"}});
 async function* entries(){for(let n=0;n<status.data.parts;n++){
  const part=await c.rpc("read_zip_part",{p_batch:parsed.data,p_part:n});if(part.error||!part.data)throw Error("ZIP_ACCESS_CHANGED");
  const bytes=Buffer.from(part.data.content,"base64");if(createHash("sha256").update(bytes).digest("hex")!==part.data.digest)throw Error("ZIP_INTEGRITY_FAILED");
  yield {name:String(part.data.name),data:new Uint8Array(bytes)};
 }}
 return new NextResponse(zipStream(entries()),{headers:{"Content-Type":"application/zip","Content-Disposition":"attachment; filename=bookforest-records.zip; filename*=UTF-8''"+encodeURIComponent("책숲-기록묶음.zip"),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
