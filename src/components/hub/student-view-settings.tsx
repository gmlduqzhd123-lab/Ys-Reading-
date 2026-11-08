"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {setClassStudentView} from "@/app/hub/completion-actions";
import type {Classroom} from "@/lib/data";
import {useTeacherWorkDraft,TeacherWorkDraftNotice} from "@/components/teacher-work-draft";
function ClassViewForm({owner,c}:{owner:string;c:Classroom}){
 const router=useRouter(),[simple,setSimple]=useState(c.simple_student_view??false),[guidance,setGuidance]=useState(c.reading_guidance??"line"),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const draft=useTeacherWorkDraft({owner,scope:"settings",context:{classroom:c.id},payload:{simple,guidance},apply:p=>{setSimple(p.simple===true);setGuidance(p.guidance==="guided"||p.guidance==="free"?p.guidance:"line");}});
 return <article><h3>{c.name}</h3><TeacherWorkDraftNotice draft={draft}/><form className="hub-form-grid" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");try{await setClassStudentView(owner,{classroom:c.id,simple,guidance});await draft.clear().catch(()=>{});setMessage("학생 화면 시작 설정을 저장했어요.");router.refresh();}catch(e){setMessage(e instanceof Error?e.message:"연결을 확인해 주세요.");}finally{setBusy(false);}}}>
 <label className="hub-check"><input type="checkbox" checked={simple} onChange={e=>setSimple(e.target.checked)} disabled={busy||draft.blocked}/>학생 메뉴 간편 보기</label>
 <label className="field">새 독서 기록의 작성 도움<select aria-label="새 독서 기록의 작성 도움" value={guidance} onChange={e=>setGuidance(e.target.value as typeof guidance)} disabled={busy||draft.blocked}><option value="line">한 문장으로 시작</option><option value="guided">질문 세 개로 생각 모으기</option><option value="free">자유롭게 쓰기</option></select></label>
 <button className="button button-outline" disabled={busy||draft.blocked}>이 학급 학생 화면 설정 저장</button>
 </form>{message&&<p role="status">{message}</p>}</article>;
}
export function StudentViewSettings({owner,classes}:{owner:string;classes:Classroom[]}){
 return <section className="panel"><h2>학생 화면 시작 설정</h2><p>학급마다 자주 쓰는 세 메뉴를 먼저 보여주고 나머지는 접어 둘 수 있어요. 학생은 언제든 더 많은 활동을 열 수 있습니다.</p>{classes.map(c=><ClassViewForm key={`${c.id}:${c.simple_student_view}:${c.reading_guidance}`} owner={owner} c={c}/>)}</section>;
}
