import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { accountReady } from "@/lib/account-access";
import { createClient } from "@/lib/supabase/server";
import { reportBundle, type GrowthReport } from "@/lib/growth-report";
import { printHtml } from "@/lib/export-documents";
export async function GET(r: NextRequest) {
  const p = await getCurrentProfile(),
    headers = {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
  if (
    !accountReady(p) ||
    (p.role === "student" && p.consent_status !== "verified")
  )
    return new NextResponse("참여 가능한 계정으로 로그인해 주세요.", {
      status: 401,
      headers,
    });
  const id = z.uuid().safeParse(r.nextUrl.searchParams.get("id"));
  if (!id.success)
    return new NextResponse("보고서를 선택해 주세요.", {
      status: 400,
      headers,
    });
  const c = await createClient(),
    row = await c.from("term_reports").select("*").eq("id", id.data).single();
  if (row.error || !row.data)
    return new NextResponse("보고서를 읽을 권한이 없습니다.", {
      status: 403,
      headers,
    });
  return new NextResponse(printHtml(reportBundle(row.data as GrowthReport)), {
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": 'inline; filename="bookforest-growth.html"',
    },
  });
}
