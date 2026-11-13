"use client";
import {useEffect,useRef,useState} from "react";
import {teacherDraftAction} from "@/app/hub/teacher-draft-actions";
import {createClient} from "@/lib/supabase/client";
import {draftKey,importTeacherDraft,type WorkScope,type WorkPayload,type DraftReply} from "@/lib/teacher-draft";
export function useTeacherWorkDraft({owner,scope,context,payload,apply,enabled=true}:{owner:string;scope:WorkScope;context:WorkPayload;payload:WorkPayload;apply:(p:WorkPayload)=>void;enabled?:boolean}){
 const contextKey=draftKey(context),valueKey=draftKey(payload),ref=useRef({context,payload,apply});ref.current={context,payload,apply};
 const [candidate,setCandidate]=useState<WorkPayload|null>(null),[message,setMessage]=useState(""),[ready,setReady]=useState(false),[blocked,setBlocked]=useState(false),[conflict,setConflict]=useState(false),[paused,setPaused]=useState(false),[load,setLoad]=useState(0),[tick,setTick]=useState(0);
 const revision=useRef(0),saved=useRef(valueKey),active=useRef(true),generation=useRef(0),inFlight=useRef<Promise<DraftReply>|null>(null),request=useRef<{hash:string;id:string}|null>(null),failures=useRef(0),clearing=useRef(false),identity=useRef(owner+scope+contextKey);
 const readyRef=useRef(ready);readyRef.current=ready;
 const pendingClear=useRef<{revision:number;request:string}|null>(null);
 useEffect(()=>{active.current=true;const {data:{subscription}}=createClient().auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_OUT"||session?.user&&session.user.id!==owner){active.current=false;generation.current++;setCandidate(null);try{ref.current.apply({});}catch{}setBlocked(true);}
 });return()=>{active.current=false;generation.current++;subscription.unsubscribe();};},[owner]);
 useEffect(()=>{
  let own=true;const g=++generation.current,newIdentity=owner+scope+contextKey;
  if(identity.current!==newIdentity){identity.current=newIdentity;request.current=null;pendingClear.current=null;failures.current=0;setConflict(false);setPaused(false);ref.current.apply({});saved.current=draftKey({});}
  setReady(false);
  void teacherDraftAction(owner,{action:"get",scope,context:ref.current.context}).then(r=>{
   if(!own||!active.current||g!==generation.current)return;
   if(!r.ok){setMessage(r.message);setPaused(true);return;}
   revision.current=r.revision;setCandidate(r.payload??null);setReady(true);
  }).catch(()=>{if(own&&active.current){setMessage("초안을 불러오지 못했어요. 입력을 유지한 채 다시 확인하거나 파일로 보관하세요.");setPaused(true);}});
  return()=>{own=false;};
 },[owner,scope,contextKey,load]);
 useEffect(()=>{
  if(!ready||!enabled||candidate||blocked||conflict||paused||clearing.current||valueKey===saved.current)return;
  const g=generation.current,timer=setTimeout(()=>{
   if(inFlight.current||!active.current||clearing.current)return;
   const hash=draftKey({context:ref.current.context,payload:ref.current.payload});if(request.current?.hash!==hash)request.current={hash,id:crypto.randomUUID()};
   const current=draftKey(ref.current.payload);setMessage("교사 입력을 임시 보관하는 중이에요.");
   const operation=teacherDraftAction(owner,{action:"save",scope,context:ref.current.context,payload:ref.current.payload,revision:revision.current,request:request.current.id});inFlight.current=operation;
   function failed(code:string,text:string){
    if(g!==generation.current||!active.current)return;
    setMessage(text);
    if(code==="STALE"){setConflict(true);setLoad(x=>x+1);}
    else if(code==="FORBIDDEN"){setPaused(true);}
    else {failures.current++;if(failures.current>=3)setPaused(true);}
   }
   void operation.then(r=>{
    if(g!==generation.current||!active.current)return;
    if(!r.ok){failed(r.code,r.message);return;}
    revision.current=r.revision;saved.current=current;request.current=null;failures.current=0;
    setMessage("교사 작성 내용을 임시 보관했어요. 최종 저장·피드백 전송은 별도로 확인해 주세요.");
   }).catch(()=>failed("RETRY","연결이 끊겼어요. 같은 요청으로 최대 세 번 다시 저장합니다. 입력은 유지하고 있어요.")).finally(()=>{if(inFlight.current===operation)inFlight.current=null;if(active.current)setTick(x=>x+1);});
  },Math.min(8000,1000*2**failures.current));
  return()=>clearTimeout(timer);
 },[owner,scope,contextKey,valueKey,ready,enabled,candidate,blocked,conflict,paused,tick]);
 const unsaved=enabled&&valueKey!==saved.current,unsavedRef=useRef(unsaved);unsavedRef.current=unsaved;
 useEffect(()=>{
  const before=(e:BeforeUnloadEvent)=>{if(unsavedRef.current){e.preventDefault();e.returnValue="";}},click=(e:MouseEvent)=>{const a=e.target instanceof Element?e.target.closest("a"):null;if(a&&unsavedRef.current&&!a.hasAttribute("download")&&!window.confirm("교사 입력을 아직 임시 보관하지 못했어요. 이동할까요?")){e.preventDefault();e.stopImmediatePropagation();}};
  const online=()=>{if(active.current){failures.current=0;setPaused(false);if(!readyRef.current)setLoad(x=>x+1);else setTick(x=>x+1);}};
  window.addEventListener("beforeunload",before);document.addEventListener("click",click,true);window.addEventListener("online",online);
  return()=>{window.removeEventListener("beforeunload",before);document.removeEventListener("click",click,true);window.removeEventListener("online",online);};
 },[]);
 async function clear(){
  clearing.current=true;await inFlight.current?.catch(()=>{});
  if(blocked||!active.current)return false;
  pendingClear.current??={revision:revision.current,request:crypto.randomUUID()};
  try{const r=await teacherDraftAction(owner,{action:"discard",scope,context:ref.current.context,...pendingClear.current});
   if(!r.ok){if(r.code==="STALE"){pendingClear.current=null;setConflict(true);setLoad(x=>x+1);}throw Error(r.message);}revision.current=r.revision;saved.current=draftKey(ref.current.payload);setCandidate(null);setConflict(false);request.current=null;pendingClear.current=null;setMessage("교사 임시 보관 내용을 정리했어요.");return true;
  }catch{setPaused(true);setMessage("최종 저장과 별도로 교사 초안 정리를 확인하지 못했어요. 다시 확인해 주세요.");return false;}
  finally{clearing.current=false;}
 }
 function restore(){if(!candidate||blocked)return;try{ref.current.apply(candidate);saved.current=draftKey(candidate);setCandidate(null);setConflict(false);setPaused(false);setMessage("교사 초안을 불러왔어요. 대상 학생과 내용을 다시 확인한 뒤 최종 저장하세요.");}catch(e){setMessage(e instanceof Error?e.message:"초안을 불러오지 못했어요.");}}
 function retry(){if(blocked)return;if(pendingClear.current){void clear();return;}failures.current=0;setPaused(false);if(!ready||conflict)setLoad(x=>x+1);else setTick(x=>x+1);}
 function keepMine(){if(!ready||blocked)return;setCandidate(null);setConflict(false);setPaused(false);saved.current="";request.current=null;failures.current=0;setTick(x=>x+1);}
 function file(){const href=URL.createObjectURL(new Blob([JSON.stringify({format:"bookforest-teacher-draft",version:1,owner,scope,context:ref.current.context,payload:ref.current.payload},null,2)],{type:"application/json;charset=utf-8"})),a=document.createElement("a");a.href=href;a.download="책숲-교사초안.json";a.click();setTimeout(()=>URL.revokeObjectURL(href),10000);}
 async function importFile(file:File){try{if(file.size>30000)throw Error("파일이 너무 커요.");const p=importTeacherDraft(await file.text(),{owner,scope,context:ref.current.context});if(!window.confirm("이 파일의 내용으로 현재 교사 입력을 바꿀까요? 최종 전송은 별도로 확인합니다."))return;ref.current.apply(p);setCandidate(null);setConflict(false);setPaused(false);saved.current="";setTick(x=>x+1);setMessage("파일의 초안을 불러왔어요. 학생과 내용을 다시 확인하세요.");}catch(e){setMessage(e instanceof Error&&e.message.includes("일치")?e.message:"현재 교사·학급용 책숲 초안 파일인지 확인해 주세요.");}}
 const displayMessage=ready&&unsaved&&!candidate&&!conflict&&!paused&&failures.current===0?"교사 입력을 임시 보관하는 중이에요.":message;
 return {candidate,current:payload,message:displayMessage,blocked,ready,unsaved,conflict,paused,restore,clear,file,retry,keepMine,importFile,confirmLeave:()=>!unsavedRef.current||window.confirm("교사 입력을 아직 임시 보관하지 못했어요. 이동할까요?")};
}
export function TeacherWorkDraftNotice({draft}:{draft:ReturnType<typeof useTeacherWorkDraft>}){
 return <aside className="notice"><p role={draft.blocked||draft.conflict?"alert":"status"}>{draft.blocked?"로그인 계정이 바뀌었어요. 현재 계정으로 화면을 다시 열어 주세요.":!draft.ready&&!draft.paused?"보관한 교사 초안을 확인하고 있어요.":draft.conflict?draft.message||"다른 화면의 초안과 현재 입력을 비교하세요.":draft.candidate?"이 화면에 임시 보관한 교사 작성 내용이 있어요.":draft.message||"교사 입력은 본인만 볼 수 있도록 7일간 임시 보관합니다."}</p>
  {draft.candidate&&<div className="button-row"><button type="button" className="button button-outline" onClick={draft.restore}>교사 초안 불러오기</button><button type="button" className="button button-outline" onClick={()=>void draft.clear()}>이 교사 초안 지우기</button></div>}
  {draft.conflict&&<><details><summary>다른 화면의 초안과 현재 입력 비교</summary><p>다른 화면의 초안</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(draft.candidate,null,2)}</pre><p>현재 입력</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(draft.current,null,2)}</pre></details><button type="button" className="button button-outline" disabled={!draft.ready} onClick={draft.keepMine}>현재 입력으로 다시 저장</button></>}
  {draft.paused&&!draft.blocked&&<button type="button" className="button button-outline" onClick={draft.retry}>초안 연결·저장 다시 확인</button>}
  <button type="button" className="button button-outline" disabled={draft.blocked} onClick={draft.file}>교사 입력 파일로 보관</button>
  <label className="field">교사 초안 파일 불러오기<input type="file" accept="application/json,.json" disabled={draft.blocked} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void draft.importFile(f);}}/></label>
 </aside>;
}
