"use client";
import {useState} from "react";
export function SchoolPicker({schools,label,required=true}:{schools:{id:string;name:string}[];label:string;required?:boolean}){
 const [manual,setManual]=useState(!schools.length);
 return <div><label className="field">{label}{manual?<input name="school" required={required} autoComplete="off" placeholder="학교 관리자에게 받은 연결 코드"/>:<select name="school" required={required} defaultValue=""><option value="">학교를 선택하세요</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}</label>
 {!!schools.length&&<button type="button" className="button button-outline" onClick={()=>setManual(!manual)}>{manual?"학교 목록에서 선택":"목록에 없는 학교 연결 코드 입력"}</button>}
 <p className="form-help">현재 권한으로 볼 수 있는 학교만 표시합니다. 학교 연결은 해당 관리자의 승인 후 적용됩니다.</p></div>;
}
