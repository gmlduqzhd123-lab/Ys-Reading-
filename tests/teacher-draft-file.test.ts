import {it,expect} from "vitest";
import {draftKey,importTeacherDraft} from "../src/lib/teacher-draft";
const owner="10000000-0000-4000-8000-000000000001",context={classroom:"30000000-0000-4000-8000-000000000001"},payload={simple:true,guidance:"guided"};
const file={format:"bookforest-teacher-draft",version:1,owner,scope:"settings",context,payload};
it("restores only the matching teacher and context and uses stable JSON keys",()=>{
 expect(draftKey({a:1,b:2})).toBe(draftKey({b:2,a:1}));
 expect(importTeacherDraft(JSON.stringify(file),{owner,scope:"settings",context})).toEqual(payload);
 expect(()=>importTeacherDraft(JSON.stringify(file),{owner,scope:"settings",context:{classroom:"other"}})).toThrow("일치");
 expect(()=>importTeacherDraft(JSON.stringify(file),{owner:owner.replace(/1$/,"2"),scope:"settings",context})).toThrow("일치");
 expect(()=>importTeacherDraft(JSON.stringify({...file,payload:{...payload,role:"operator"}}),{owner,scope:"settings",context})).toThrow();
});
