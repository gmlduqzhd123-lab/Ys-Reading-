import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { loadDashboard } from "@/lib/data";
import { WorkEditor } from "@/components/work-editor";
import { createClient } from "@/lib/supabase/server";
export const metadata={title:"생각 쓰기"};
export default async function WorkPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const data=await loadDashboard();
  if(data.profile.role!=="student")redirect("/app?view=feedback");
  const assignment=data.assignments.find(a=>a.id===id);if(!assignment)notFound();
  let choiceKey:string|undefined;
  if(assignment.choices?.length&&data.profile.consent_status==="verified"){
    const client=await createClient();
    const result=await client.from("mission_selections").select("choice_key").eq("assignment_id",id).eq("student_id",data.profile.id).maybeSingle();
    if(result.error)throw new Error("선택한 활동을 확인하지 못했습니다. 다시 시도해 주세요.");
    choiceKey=result.data?.choice_key;
  }
  return <><Link href="/hub?tab=today" className="back-link"><ArrowLeft size={16}/>오늘 할 일로 돌아가기</Link><WorkEditor data={data} assignment={assignment} choiceKey={choiceKey}/></>;
}
