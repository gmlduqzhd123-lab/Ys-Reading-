import {z} from "zod";
export type WorkScope="review"|"report"|"settings";
export type WorkPayload=Record<string,unknown>;
export type DraftReply={ok:true;revision:number;payload?:WorkPayload|null;updatedAt?:string}|{ok:false;code:"STALE"|"RETRY"|"FORBIDDEN";message:string};
export function draftKey(v:unknown):string{
 if(Array.isArray(v))return "["+v.map(draftKey).join(",")+"]";
 if(v&&typeof v==="object")return "{"+Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+":"+draftKey(x)).join(",")+"}";
 return JSON.stringify(v)??"null";
}
export function draftPayload(scope:WorkScope,p:unknown):WorkPayload{
 const schemas={review:z.object({selected:z.array(z.uuid()).min(1).max(20),body:z.string().max(2000),decision:z.enum(["completed","revision_requested"])}).strict(),report:z.object({title:z.string().max(100),note:z.string().max(2000),works:z.array(z.uuid()).max(3)}).strict(),settings:z.object({simple:z.boolean(),guidance:z.enum(["line","guided","free"])}).strict()};
 return schemas[scope].parse(p);
}
export function importTeacherDraft(raw:string,target:{owner:string;scope:WorkScope;context:WorkPayload}){
 if(new TextEncoder().encode(raw).length>30000)throw Error("파일이 너무 커요.");
 const v=z.object({format:z.literal("bookforest-teacher-draft"),version:z.literal(1),owner:z.uuid(),scope:z.enum(["review","report","settings"]),context:z.record(z.string(),z.unknown()),payload:z.record(z.string(),z.unknown())}).strict().parse(JSON.parse(raw));
 if(v.owner!==target.owner||v.scope!==target.scope||draftKey(v.context)!==draftKey(target.context))throw Error("현재 교사·학급·학생·기간과 일치하는 초안 파일을 선택해 주세요.");
 return draftPayload(target.scope,v.payload);
}
