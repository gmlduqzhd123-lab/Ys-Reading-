"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {setClassStudentView} from "@/app/hub/completion-actions";
import type {Classroom} from "@/lib/data";
export function StudentViewSettings({owner,classes}:{owner:string;classes:Classroom[]}){
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),router=useRouter();
  return <section className="panel"><h2>학생 화면 시작 설정</h2><p>학급마다 자주 쓰는 세 메뉴를 먼저 보여주고 나머지는 접어 둘 수 있어요. 학생은 언제든 더 많은 활동을 열 수 있습니다.</p>
    {classes.map(c=><form key={`${c.id}:${c.simple_student_view}:${c.reading_guidance}`} className="hub-form-grid" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setMessage("");try{await setClassStudentView(owner,{classroom:c.id,simple:f.get("simple")==="on",guidance:f.get("guidance")});setMessage("학생 화면 시작 설정을 저장했어요.");router.refresh();}catch(e){setMessage(e instanceof Error?e.message:"연결을 확인해 주세요.");}finally{setBusy(false);}}}>
      <h3>{c.name}</h3><label className="hub-check"><input name="simple" type="checkbox" defaultChecked={c.simple_student_view} disabled={busy}/>학생 메뉴 간편 보기</label>
      <label className="field">새 독서 기록의 작성 도움<select name="guidance" defaultValue={c.reading_guidance??"line"} disabled={busy}><option value="line">한 문장으로 시작</option><option value="guided">질문 세 개로 생각 모으기</option><option value="free">자유롭게 쓰기</option></select></label>
      <button className="button button-outline" disabled={busy}>이 학급 학생 화면 설정 저장</button>
    </form>)}{message&&<p role="status">{message}</p>}
  </section>;
}
