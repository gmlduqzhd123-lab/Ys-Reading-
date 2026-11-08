import {it,expect} from "vitest";import {hubHref} from "../src/lib/hub-navigation";
it("preserves a selected class and explicitly clears remembered context for all classes",()=>{
 expect(hubHref("reading","selected",{page:2})).toBe("/hub?tab=reading&classroom=selected&page=2");
 expect(new URL(hubHref("exports"),"https://test.invalid").searchParams.has("classroom")).toBe(true);
 expect(new URL(hubHref("exports"),"https://test.invalid").searchParams.get("classroom")).toBe("");
});
