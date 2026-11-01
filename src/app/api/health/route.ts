import { NextResponse } from "next/server";
import { isSupabaseConfigured,getSupabaseConfig } from "@/lib/supabase/config";
import { checkService } from "@/lib/service-health";

export async function GET(request:Request) {
  if(new URL(request.url).searchParams.get("deep")==="1"){
    const status=await checkService(getSupabaseConfig());
    return NextResponse.json({service:"bookforest",version:"0.1.0",...status},{status:status.status==="ok"?200:503,headers:{"Cache-Control":"no-store"}});
  }
  return NextResponse.json({ service: "bookforest", version: "0.1.0", configured: isSupabaseConfigured() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
