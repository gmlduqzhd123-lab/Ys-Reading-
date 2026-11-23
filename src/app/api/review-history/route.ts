import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accountReady } from "@/lib/account-access";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
  const hidden = () => reply({ error: "이 글의 제출 이력을 열 수 없어요." }, 404);
  const unavailable = () => reply({ error: "제출 이력을 읽지 못했어요. 잠시 후 다시 시도해 주세요." }, 503);
  try {
    const profile = await getCurrentProfile();
    if (!accountReady(profile) || profile.role !== "teacher") return hidden();
    const query = request.nextUrl.searchParams;
    const id = z.uuid().safeParse(query.get("submission"));
    const page = Number(query.get("page") ?? "1");
    if (!id.success || !Number.isInteger(page) || page < 1 || page > 100000)
      return reply({ error: "글과 제출 이력 페이지를 확인해 주세요." }, 400);
    const client = await createClient();
    const { data: anchor, error: anchorError } = await client.from("submissions")
      .select("assignment_id,student_id,assignments!inner(classroom_id)")
      .eq("id", id.data).maybeSingle();
    if (anchorError) return unavailable();
    if (!anchor) return hidden();
    const { assignment_id, student_id, assignments } = anchor as unknown as {
      assignment_id: string; student_id: string; assignments: { classroom_id: string };
    };
    const classroom = assignments.classroom_id;
    const { data: scope, error: scopeError } = await client.rpc("collaboration_state", { p_classroom: classroom });
    if (scopeError) return scopeError.message === "BF_FORBIDDEN" ? hidden() : unavailable();
    if (!scope?.classes?.some((item: { id: string; owner: boolean; review: boolean }) =>
      item.id === classroom && (item.owner || item.review))) return hidden();
    const pageSize = 20;
    const { data, error, count } = await client.from("submissions")
      .select("id,version,title,body,status,created_at,feedback(id,body,decision,created_at)", { count: "exact" })
      .eq("assignment_id", assignment_id).eq("student_id", student_id)
      .order("version", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error || !data) return unavailable();
    const submissions = data.map(row => ({
      ...row,
      feedback: Array.isArray(row.feedback) ? row.feedback : row.feedback ? [row.feedback] : [],
    }));
    return reply({ submissions, page, hasNext: (count ?? 0) > page * pageSize });
  } catch {
    return unavailable();
  }
}
