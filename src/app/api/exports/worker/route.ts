import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {getSupabaseConfig} from "@/lib/supabase/config";
import {docxBytes,csvText,type ExportBundle} from "@/lib/export-documents";
import {readCloudJob} from "../../../../../supabase/functions/_shared/cloud-request.mjs";
export const maxDuration=60;
// One-use private DB capability; no user token, service key or document text is
// accepted from the caller. The broker reads under the initiating actor's RLS.
export async function POST(r:NextRequest){
 let task:string;try{task=await readCloudJob(r);}catch{return NextResponse.json({code:"INVALID_REQUEST"},{status:400});}
 const config=getSupabaseConfig();if(!config)return NextResponse.json({code:"UNAVAILABLE"},{status:503});
 const c=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}}),claimed=await c.rpc("claim_zip_task",{p_task:task});
 if(claimed.error||!claimed.data)return NextResponse.json({code:"JOB_UNAVAILABLE"},{status:403});
 const job=claimed.data;
 try{
  const bytes=job.format==="docx"?await docxBytes(job.bundle as ExportBundle):Buffer.from(csvText(job.bundle as ExportBundle),"utf8");
  if(bytes.length>3145728)throw Error("PART_TOO_LARGE");
  const finished=await c.rpc("finish_zip_task",{p_task:task,p_lease:job.lease,p_content:bytes.toString("base64"),p_ok:true});
  if(finished.error)throw Error("PART_NOT_COMMITTED");
  return NextResponse.json({code:"PART_STORED"},{headers:{"Cache-Control":"no-store"}});
 }catch{
  await c.rpc("finish_zip_task",{p_task:task,p_lease:job.lease,p_ok:false});
  return NextResponse.json({code:"PART_FAILED"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
