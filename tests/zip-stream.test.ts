import {it,expect} from "vitest";
import JSZip from "jszip";
import {zipStream} from "../src/lib/zip-stream";
it("streams a valid UTF-8 ZIP one document at a time with verified CRCs",async()=>{
 async function* entries(){yield{name:"책숲-1-2.csv",data:new TextEncoder().encode("한글 첫 기록")};yield{name:"책숲-2-2.csv",data:new TextEncoder().encode("다음 기록")};}
 const zip=await JSZip.loadAsync(await new Response(zipStream(entries())).arrayBuffer(),{checkCRC32:true});
 expect(Object.keys(zip.files)).toEqual(["책숲-1-2.csv","책숲-2-2.csv"]);expect(await zip.file("책숲-1-2.csv")!.async("text")).toBe("한글 첫 기록");
});
it("rejects paths and closes the source when a stream is cancelled",async()=>{
 async function* bad(){yield{name:"../secret.csv",data:new Uint8Array([1])};}
 await expect(new Response(zipStream(bad())).arrayBuffer()).rejects.toThrow("ZIP_BOUNDS");
 let closed=false;async function* source(){try{yield{name:"책숲-1-1.csv",data:new Uint8Array([1])};}finally{closed=true;}}
 const reader=zipStream(source()).getReader();await reader.read();await reader.cancel();expect(closed).toBe(true);
});
