"use client";
import {useEffect,useRef,useState} from "react";
import {teacherDraftAction} from "@/app/hub/teacher-draft-actions";
import {createClient} from "@/lib/supabase/client";
type Payload=Record<string,unknown>;
export function useTeacherWorkDraft({owner,scope,context,payload,apply,enabled=true}:{owner:string;scope:"review"|"report"|"settings";context:Payload;payload:Payload;apply:(p:Payload)=>void;enabled?:boolean}){
 const contextKey=JSON.stringify(context),valueKey=JSON.stringify(payload),ref=useRef({context,payload,apply,enabled});ref.current={context,payload,apply,enabled};
 const [candidate,setCandidate]=useState<Payload|null>(null),[message,setMessage]=useState(""),[ready,setReady]=useState(false),[blocked,setBlocked]=useState(false),[retry,setRetry]=useState(0);
 const revision=useRef(0),baseline=useRef(valueKey),saved=useRef(valueKey),active=useRef(true),generation=useRef(0),inFlight=useRef<Promise<unknown>|null>(null),request=useRef<{hash:string;id:string}|null>(null),conflict=useRef(false);
 useEffect(()=>{active.current=true;const {data:{subscription}}=createClient().auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"||session?.user&&session.user.id!==owner){active.current=false;generation.current++;setCandidate(null);try{ref.current.apply({});}catch{}setBlocked(true);}});return()=>{active.current=false;generation.current++;subscription.unsubscribe();};},[owner]);
 useEffect(()=>{let own=true;const g=++generation.current;setReady(false);setCandidate(null);setMessage("");conflict.current=false;request.current=null;baseline.current=JSON.stringify(ref.current.payload);saved.current=baseline.current;
 void teacherDraftAction(owner,{action:"get",scope,context:ref.current.context}).then(r=>{if(!own||!active.current||g!==generation.current)return;revision.current=r.revision;setCandidate(r.payload??null);setReady(true);}).catch(e=>{if(own&&active.current)setMessage(e.message);});return()=>{own=false;};},[owner,scope,contextKey]);
 useEffect(()=>{if(!ready||!enabled||candidate||blocked||conflict.current||valueKey===saved.current)return;
 const g=generation.current,timer=setTimeout(()=>{
 if(inFlight.current||!active.current)return;
 const hash=JSON.stringify({context:ref.current.context,payload:ref.current.payload});if(request.current?.hash!==hash)request.current={hash,id:crypto.randomUUID()};
 const current=JSON.stringify(ref.current.payload),operation=teacherDraftAction(owner,{action:"save",scope,context:ref.current.context,payload:ref.current.payload,revision:revision.current,request:request.current.id});inFlight.current=operation;
 void operation.then(r=>{if(g!==generation.current||!active.current)return;revision.current=r.revision;saved.current=current;request.current=null;setMessage("교사 작성 내용을 임시 보관했어요. 최종 저장·피드백 전송은 별도로 확인해 주세요.");}).catch(e=>{if(g===generation.current&&active.current){conflict.current=true;setMessage(e.message);}}).finally(()=>{if(inFlight.current===operation)inFlight.current=null;if(active.current)setRetry(x=>x+1);});
 },1000);return()=>clearTimeout(timer);},[owner,scope,contextKey,valueKey,ready,enabled,candidate,blocked,retry]);
 const unsaved=enabled&&valueKey!==saved.current;
 const unsavedRef=useRef(unsaved);unsavedRef.current=unsaved;
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(unsavedRef.current){e.preventDefault();e.returnValue="";}},click=(e:MouseEvent)=>{const a=e.target instanceof Element?e.target.closest("a"):null;if(a&&unsavedRef.current&&!a.hasAttribute("download")&&!window.confirm("교사 입력을 아직 임시 보관하지 못했어요. 이동할까요?")){e.preventDefault();e.stopImmediatePropagation();}};window.addEventListener("beforeunload",before);document.addEventListener("click",click,true);return()=>{window.removeEventListener("beforeunload",before);document.removeEventListener("click",click,true);};},[]);
 async function clear(){await inFlight.current;if(blocked||!active.current)return;const r=await teacherDraftAction(owner,{action:"discard",scope,context:ref.current.context,revision:revision.current,request:crypto.randomUUID()});revision.current=r.revision;baseline.current=JSON.stringify(ref.current.payload);saved.current=baseline.current;setCandidate(null);request.current=null;setMessage("교사 임시 보관 내용을 정리했어요.");}
 function restore(){if(!candidate||blocked)return;try{ref.current.apply(candidate);saved.current=JSON.stringify(candidate);setCandidate(null);setMessage("교사 초안을 불러왔어요. 대상 학생과 내용을 다시 확인한 뒤 최종 저장하세요.");}catch(e){setMessage(e instanceof Error?e.message:"초안을 불러오지 못했어요.");}}
 function file(){const data=candidate??ref.current.payload,href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"})),a=document.createElement("a");a.href=href;a.download="책숲-교사초안.json";a.click();setTimeout(()=>URL.revokeObjectURL(href),10000);}
 const displayMessage=ready&&unsaved&&!candidate&&!conflict.current&&!blocked?"교사 입력을 임시 보관하는 중이에요.":message;
 return {candidate,message:displayMessage,blocked,ready,unsaved,restore,clear,file,confirmLeave:()=>!unsavedRef.current||window.confirm("교사 입력을 아직 임시 보관하지 못했어요. 이동할까요?")};
}
export function TeacherWorkDraftNotice({draft}:{draft:ReturnType<typeof useTeacherWorkDraft>}){
 return <aside className="notice"><p role={draft.blocked?"alert":"status"}>{draft.blocked?"로그인 계정이 바뀌었어요. 현재 계정으로 화면을 다시 열어 주세요.":draft.candidate?"이 화면에 임시 보관한 교사 작성 내용이 있어요.":draft.message||"교사 입력은 본인만 볼 수 있도록 7일간 임시 보관합니다."}</p>
 {draft.candidate&&<div className="button-row"><button type="button" className="button button-outline" onClick={draft.restore}>교사 초안 불러오기</button><button type="button" className="button button-outline" onClick={()=>void draft.clear().catch(()=>{})}>이 교사 초안 지우기</button></div>}
 <button type="button" className="button button-outline" disabled={draft.blocked} onClick={draft.file}>교사 입력 파일로 보관</button></aside>;
}
