import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { loadDashboard } from "@/lib/data";
import { WorkEditor } from "@/components/work-editor";
export const metadata={title:"생각 쓰기"};
export default async function WorkPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const data=await loadDashboard();if(data.profile.role!=="student")redirect("/app?view=feedback");const assignment=data.assignments.find(a=>a.id===id);if(!assignment)notFound();return <><Link href="/app" className="back-link"><ArrowLeft size={16}/>우리 교실로 돌아가기</Link><WorkEditor data={data} assignment={assignment}/></>}
