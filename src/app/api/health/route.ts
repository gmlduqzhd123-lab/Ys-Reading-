import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET() {
  return NextResponse.json({ service: "bookforest", version: "0.1.0", configured: isSupabaseConfigured() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
