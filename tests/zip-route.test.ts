import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const mocks=vi.hoisted(()=>({profile:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/auth",()=>({getCurrentProfile:mocks.profile}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:mocks.rpc})}));
import {HEAD,GET} from "@/app/api/exports/zip/route";
const request=()=>new NextRequest("https://school.example/api/exports/zip?batch=10000000-0000-4000-8000-000000000001");
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.profile.mockResolvedValue({role:"teacher",consent_status:"verified",account_active:true,session_fresh:true});
 mocks.rpc.mockImplementation(async(name:string)=>({error:null,data:name==="zip_job"?{state:"complete",parts:0}:name==="export_usage"?{requestsThisMinute:0}:true}));
});
it("returns a safe retry response when account lookup rejects before HEAD or GET",async()=>{
 mocks.profile.mockRejectedValue(Error("private database detail"));
 for(const handler of [HEAD,GET]){const response=await handler(request());expect(response.status).toBe(503);expect(await response.json()).toEqual(expect.objectContaining({code:"EXPORT_UNAVAILABLE"}));}
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not charge a successful HEAD and charges only the actual streamed GET",async()=>{
 expect((await HEAD(request())).status).toBe(200);
 expect(mocks.rpc.mock.calls.map(c=>c[0])).not.toContain("consume_export_budget");
 const response=await GET(request());expect(response.status).toBe(200);await response.arrayBuffer();
 expect(mocks.rpc.mock.calls.filter(c=>c[0]==="consume_export_budget")).toHaveLength(1);
});
it("supplies Retry-After without charging when the download budget is exhausted",async()=>{
 mocks.rpc.mockImplementation(async(name:string)=>({error:null,data:name==="zip_job"?{state:"complete",parts:0}:name==="export_usage"?{requestsThisMinute:60}:true}));
 const response=await HEAD(request());expect(response.status).toBe(429);expect(response.headers.get("Retry-After")).toBe("60");
 expect(mocks.rpc.mock.calls.map(c=>c[0])).not.toContain("consume_export_budget");
});
