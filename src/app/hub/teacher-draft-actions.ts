"use server";
import {z} from "zod";
import {requireProfile} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import type {DraftReply} from "@/lib/teacher-draft";
export async function teacherDraftAction(owner:string,input:unknown):Promise<DraftReply>{
 const p=await requireProfile();if(p.id!==z.uuid().parse(owner)||p.role!=="teacher")throw Error("현재 선생님 계정으로 다시 열어 주세요.");
 const v=z.object({action:z.enum(["get","save","discard"]),scope:z.enum(["review","report","settings"]),context:z.record(z.string(),z.unknown()),payload:z.record(z.string(),z.unknown()).nullable().default(null),revision:z.number().int().min(0).default(0),request:z.uuid().nullable().default(null)}).strict().parse(input);
 const c=await createClient(),r=await c.rpc("teacher_work_draft",{p_action:v.action,p_scope:v.scope,p_context:v.context,p_payload:v.payload,p_revision:v.revision,p_request:v.request});
 if(r.error){const stale=r.error.message.includes("BF_STALE_REVISION"),temporary=["PGRST000","PGRST001","PGRST002","57014","53300","08006"].includes(r.error.code)||/fetch failed|network|timeout/i.test(r.error.message);return {ok:false,code:stale?"STALE":temporary?"RETRY":"FORBIDDEN",message:stale?"다른 화면에서 교사 초안이 바뀌었어요. 두 내용을 비교한 뒤 선택하세요.":temporary?"연결을 확인한 뒤 같은 요청으로 다시 저장할게요.":"교사 초안의 현재 학급 권한·동의를 확인해 주세요."};}
 return {ok:true,...r.data};
}
